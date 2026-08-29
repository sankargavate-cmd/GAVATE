import {
  OrderStatus,
  PaymentStatus,
  RefundStatus,
  TractorBookingStatus,
  TransportBookingStatus,
  WorkRequestStatus,
} from "@prisma/client";
import { prisma } from "../config/database";
import { CASHFREE_GATEWAY_NAME } from "../config/cashfree";
import {
  CashfreeOrderStatus,
  CashfreePaymentStatus,
  CashfreeRefundStatus,
} from "../constants/payment";
import { AppError } from "../middlewares/errorHandler";
import * as paymentService from "./payment.service";
import { PaymentResult } from "./payment.service";
import {
  CashfreeApiError,
  CashfreeOrderEntity,
  CashfreeRefundEntity,
  CashfreeWebhookPayload,
  createCashfreeOrder,
  createCashfreeRefund,
  fetchCashfreeOrder,
  fetchCashfreeRefund,
  verifyCashfreeWebhookSignature,
} from "./cashfree.service";
import { CreateCashfreeOrderInput, InitiateRefundInput } from "../validators/payment.validator";
import { logger } from "../utils/logger";

/**
 * Orchestrates the existing Payment model/service (payment.service.ts,
 * unchanged from Step 34) with the Cashfree REST client
 * (cashfree.service.ts, Step 35). This is the only place gateway
 * "webhook says X, so set our own status to Y" decisions are made — both
 * the webhook handler and the manual status-check endpoint funnel
 * through reconcilePaymentStatus below, so the same
 * duplicate/out-of-order protection applies to both paths.
 */

const PAYMENT_NOT_PAYABLE_MESSAGE = "This payment cannot be processed further";
const ORDER_NOT_ACTIVE_MESSAGE =
  "A Cashfree order already exists for this payment and is no longer active";
const WEBHOOK_ORDER_UNKNOWN = "Cashfree webhook referenced an order this app has no record of";

// Step 46 — Cashfree's own error code (confirmed against their Create
// Order API reference) for "an order with this order_id was already
// created". This app's Cashfree order_id is deterministic per Payment
// (`ss-<paymentId>`, see createCashfreeOrderForPayment below), so this
// code is exactly what Cashfree returns to the *losing* side of two
// concurrent createCashfreeOrderForPayment calls for the same Payment —
// see that function's doc comment for the full race and why this is
// recovered from rather than surfaced as a failure.
const CASHFREE_ORDER_ALREADY_EXISTS_CODE = "order_already_exists";

// Step 41 — Refunds/Cancellation Handling.
const PAYMENT_NOT_REFUNDABLE_MESSAGE = "Only successfully paid payments can be refunded";
const ALREADY_REFUNDED_MESSAGE = "This payment has already been refunded";
const REFUND_NOT_ELIGIBLE_MESSAGE =
  "This payment is not eligible for a refund — the related booking/request/order must be cancelled first";
const WEBHOOK_REFUND_UNKNOWN =
  "Cashfree refund webhook referenced a refund this app has no record of";

// Statuses a Payment can no longer meaningfully move on from. Mirrors
// the doc comment on the PaymentStatus enum in schema.prisma: SUCCESS/
// FAILED/CANCELLED/REFUNDED are all terminal, but only SUCCESS/REFUNDED
// are "final good outcomes" that must never be overwritten by a
// late/duplicate/out-of-order webhook (see shouldApplyStatus below).
const LOCKED_STATUSES: PaymentStatus[] = [PaymentStatus.SUCCESS, PaymentStatus.REFUNDED];

/**
 * Maps Cashfree's own `payment_status` (webhook payload / payment
 * entity) to this app's PaymentStatus enum. Returns null for
 * NOT_ATTEMPTED, which means "order exists, nothing has happened yet" —
 * indistinguishable from our own default INITIATED, so there is nothing
 * to reconcile.
 */
function mapCashfreePaymentStatus(status: CashfreePaymentStatus): PaymentStatus | null {
  switch (status) {
    case "SUCCESS":
      return PaymentStatus.SUCCESS;
    case "FAILED":
      return PaymentStatus.FAILED;
    case "USER_DROPPED":
    case "VOID":
    case "CANCELLED":
      return PaymentStatus.CANCELLED;
    case "PENDING":
      return PaymentStatus.PENDING;
    case "NOT_ATTEMPTED":
    default:
      return null;
  }
}

/**
 * Maps Cashfree's order-level `order_status` (Get Order API) to this
 * app's PaymentStatus enum, for the manual "check status" endpoint.
 * Coarser than the webhook's per-attempt payment_status — ACTIVE means
 * "still awaiting a successful attempt", so it maps to PENDING rather
 * than leaving the payment at its current status, only when the payment
 * isn't already further along.
 */
function mapCashfreeOrderStatus(status: CashfreeOrderStatus): PaymentStatus | null {
  switch (status) {
    case "PAID":
      return PaymentStatus.SUCCESS;
    case "EXPIRED":
    case "TERMINATED":
    case "TERMINATION_REQUESTED":
      return PaymentStatus.FAILED;
    case "ACTIVE":
      return PaymentStatus.PENDING;
    default:
      return null;
  }
}

/**
 * The single duplicate/out-of-order guard both the webhook handler and
 * the status-check endpoint go through. Never trusts the caller's
 * intent blindly — decides, from the payment's *current* stored status,
 * whether `nextStatus` is safe to apply:
 *
 * - A payment already in a locked (SUCCESS/REFUNDED) state never moves
 *   again here — refunds are a future step's job, and a late/replayed/
 *   out-of-order webhook must never downgrade a completed sale.
 * - Otherwise, re-applying the exact same status (a true duplicate
 *   webhook delivery) is a safe no-op — skip the write rather than
 *   perform a redundant update.
 * - Any other transition (INITIATED/PENDING/FAILED/CANCELLED -> anything,
 *   including a retried payment eventually succeeding) is allowed.
 */
function shouldApplyStatus(
  current: PaymentResult,
  nextStatus: PaymentStatus,
  nextGatewayPaymentId?: string
): boolean {
  if (LOCKED_STATUSES.includes(current.status)) {
    return false;
  }

  const isExactDuplicate =
    current.status === nextStatus &&
    (nextGatewayPaymentId === undefined || current.gatewayPaymentId === nextGatewayPaymentId);

  return !isExactDuplicate;
}

/**
 * Maps Cashfree's own `refund_status` (Create/Get Refund API response,
 * refund webhook payload) to this app's RefundStatus enum. Cashfree's
 * CANCELLED (a refund request that didn't go through) maps to this
 * app's FAILED — from this app's perspective both mean "this refund
 * attempt did not succeed", and RefundStatus intentionally has no
 * separate CANCELLED state of its own (see RefundStatus's doc comment in
 * schema.prisma) to avoid a distinction nothing downstream acts on
 * differently.
 */
function mapCashfreeRefundStatus(status: CashfreeRefundStatus): RefundStatus | null {
  switch (status) {
    case "SUCCESS":
      return RefundStatus.SUCCESS;
    case "CANCELLED":
      return RefundStatus.FAILED;
    case "PENDING":
      return RefundStatus.PENDING;
    default:
      return null;
  }
}

/**
 * The refund equivalent of shouldApplyStatus above — the single
 * duplicate/out-of-order guard both the refund webhook handler and the
 * manual refund-status-check endpoint go through:
 *
 * - A refund already at SUCCESS never moves again here — once a refund
 *   is confirmed complete, a late/replayed webhook must never downgrade
 *   it back to PENDING/FAILED.
 * - Re-applying the exact same refundStatus (a true duplicate webhook
 *   delivery) is a safe no-op — skip the write.
 * - Any other transition (null/PENDING/FAILED -> anything, including a
 *   retried refund eventually succeeding) is allowed.
 */
function shouldApplyRefundStatus(current: PaymentResult, nextStatus: RefundStatus): boolean {
  if (current.refundStatus === RefundStatus.SUCCESS) {
    return false;
  }

  return current.refundStatus !== nextStatus;
}

/**
 * Refund eligibility check (Step 41): a Payment may only be refunded
 * once the domain object it was collected for has actually been
 * cancelled through that module's *existing, unmodified* cancellation
 * flow (workRequest.service.ts's cancelWorkRequest,
 * tractorBooking.service.ts's cancelTractorBooking, etc. — Steps 19-24,
 * untouched by this step). This function only *reads* each entity's
 * current `status`; it never writes to WorkRequest/TractorBooking/
 * TransportBooking/Order, so cancelling those models' own lifecycle
 * remains exclusively those services' responsibility, and a refund can
 * never accidentally cross into another entity's status transition.
 * Returns false (not eligible) for a Payment with no relatedEntityType/
 * relatedEntityId (e.g. purpose "OTHER") — there is nothing to check
 * cancellation against.
 */
async function isRelatedEntityCancelled(
  relatedEntityType: string | null,
  relatedEntityId: string | null
): Promise<boolean> {
  if (!relatedEntityType || !relatedEntityId) {
    return false;
  }

  switch (relatedEntityType) {
    case "WORK_REQUEST": {
      const entity = await prisma.workRequest.findUnique({
        where: { id: relatedEntityId },
        select: { status: true },
      });
      return entity?.status === WorkRequestStatus.CANCELLED;
    }
    case "TRACTOR_BOOKING": {
      const entity = await prisma.tractorBooking.findUnique({
        where: { id: relatedEntityId },
        select: { status: true },
      });
      return entity?.status === TractorBookingStatus.CANCELLED;
    }
    case "TRANSPORT_BOOKING": {
      const entity = await prisma.transportBooking.findUnique({
        where: { id: relatedEntityId },
        select: { status: true },
      });
      return entity?.status === TransportBookingStatus.CANCELLED;
    }
    case "ORDER": {
      const entity = await prisma.order.findUnique({
        where: { id: relatedEntityId },
        select: { status: true },
      });
      return entity?.status === OrderStatus.CANCELLED;
    }
    default:
      return false;
  }
}

/**
 * Creates a Cashfree order for an existing Payment record and returns
 * the `payment_session_id` a (future) checkout step would use. Scoped
 * to the calling user via paymentService.getPaymentById, which 404s on
 * any payment that isn't theirs — mirrors every other ownership check in
 * this codebase.
 *
 * Idempotent by design: calling this twice for the same payment reuses
 * the existing Cashfree order (fetching its live status) instead of
 * creating a second one, as long as that order is still ACTIVE.
 *
 * Step 46 — closes a gap in that idempotency left open by Step 45.
 * Step 45's Serializable transaction only protects the *Payment row*
 * (find-active-or-create) inside the four *Payment.service.ts callers;
 * it deliberately ends before this function runs, so this function's own
 * "read gatewayReferenceId, then create-or-reuse the Cashfree order" is
 * not covered by it and is not itself atomic. Two concurrent calls to
 * this function for the *same* paymentId (e.g. a double-tap on "Pay Now"
 * firing two HTTP requests, each of which passes Step 45's transaction
 * and lands on the same, already-existing Payment) can both read
 * `payment.gatewayReferenceId` as null before either has written it, and
 * both then reach the create-order call below with the same deterministic
 * `cashfreeOrderId`. Cashfree itself rejects the second of those two
 * calls with `code: "order_already_exists"` (their own idempotency on
 * order_id) — without the catch block below, that surfaced as a hard
 * failure to whichever request lost the race, even though a valid,
 * usable order/session had genuinely just been created by the other one.
 * The fix does not add a lock or wrap this call in a DB transaction (this
 * function's whole point is to keep the external Cashfree call outside
 * one); it instead recognizes Cashfree's own idempotency error and, only
 * for that specific code, falls back to fetching the order the *other*
 * request just created — the exact same fetch-and-reuse path already used
 * a few lines above for a genuine repeat call.
 */
export async function createCashfreeOrderForPayment(
  userId: string,
  paymentId: string,
  input: CreateCashfreeOrderInput
): Promise<{ orderId: string; paymentSessionId: string | undefined; payment: PaymentResult }> {
  const payment = await paymentService.getPaymentById(userId, paymentId);

  if (payment.status !== PaymentStatus.INITIATED && payment.status !== PaymentStatus.PENDING) {
    throw new AppError(PAYMENT_NOT_PAYABLE_MESSAGE, 400);
  }

  // Re-use an already-created order when this endpoint is called again
  // for the same payment (e.g. a checkout page refresh), instead of
  // creating a duplicate Cashfree order for one Payment record.
  if (payment.gatewayReferenceId) {
    const existingOrder = await fetchCashfreeOrder(payment.gatewayReferenceId);
    if (existingOrder.order_status === "ACTIVE") {
      return {
        orderId: existingOrder.order_id,
        paymentSessionId: existingOrder.payment_session_id,
        payment,
      };
    }

    // Step 47 — the order tied to this Payment is no longer ACTIVE
    // (Cashfree's `order_id` is deterministic per-Payment — see
    // cashfreeOrderId below — so this app can never create a second,
    // fresh order for the same Payment once this one is dead). Without
    // reconciling here, a Payment whose order simply expired (the farmer
    // never completed checkout, or came back after Cashfree's ~30 min
    // order TTL) stays at INITIATED/PENDING forever: this endpoint keeps
    // fetching the same dead order and keeps throwing ORDER_NOT_ACTIVE
    // on every retry, and none of the four *Payment.service.ts
    // find-or-create callers will ever open a fresh Payment for it either
    // — INITIATED/PENDING are both in ACTIVE_PAYMENT_STATUSES, so they
    // keep reusing this same permanently-dead Payment id instead.
    //
    // Reconciles from the order response already fetched above (no
    // second Cashfree call — see applyOrderStatusToPayment's doc
    // comment) via the exact same mapping/guard
    // reconcilePaymentStatusFromCashfree uses, so this can never conflict
    // with — or duplicate — that path. If the order genuinely
    // expired/terminated, this moves the Payment to FAILED — outside
    // ACTIVE_PAYMENT_STATUSES — so the farmer's next "Pay Now" tap opens
    // a brand-new Payment (and therefore a brand-new deterministic
    // order_id) through the normal find-or-create flow, rather than
    // being stuck retrying a dead one indefinitely.
    //
    // Step 48 — if Cashfree's order actually did get paid (order_status
    // PAID) but the webhook/status-check hasn't reconciled it yet, this
    // still promotes the Payment straight to SUCCESS (the write below is
    // unconditional, via applyOrderStatusToPayment, regardless of what we
    // do with the result) — but a payment_session_id is never handed back
    // for it. A payment_session_id means "here, use this to check out",
    // which is never correct once the Payment is terminal: this exact
    // function throws PAYMENT_NOT_PAYABLE_MESSAGE for any payment that
    // was *already* SUCCESS/FAILED/etc. before this call even started
    // (see the guard at the top of this function) — a payment that only
    // *became* SUCCESS during this same call must be treated identically,
    // not handed a stale/misleading checkout session for a payment that's
    // already done. The reconciliation write itself is preserved either
    // way; only the response for the SUCCESS case changes here.
    const reconciled = await applyOrderStatusToPayment(payment, existingOrder);
    if (reconciled.status === PaymentStatus.SUCCESS) {
      throw new AppError(PAYMENT_NOT_PAYABLE_MESSAGE, 400);
    }
    throw new AppError(ORDER_NOT_ACTIVE_MESSAGE, 409);
  }

  // Cashfree order_id: only alphanumeric/underscore/hyphen, 3-45 chars.
  // Prisma's cuid ids satisfy that already; prefixed for readability in
  // the Cashfree dashboard. Deterministic per Payment — this is also what
  // makes the order_already_exists recovery below correct: any
  // concurrent caller for this same Payment computes this exact same id.
  const cashfreeOrderId = `ss-${payment.id}`;

  let order: CashfreeOrderEntity;
  try {
    order = await createCashfreeOrder({
      order_id: cashfreeOrderId,
      // Amount/currency always come from this app's own Payment record —
      // never from the request body — so a client can never alter what
      // it ends up being charged.
      order_amount: payment.amount,
      order_currency: payment.currency,
      customer_details: {
        customer_id: payment.userId,
        customer_phone: input.customerPhone,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
      },
    });
  } catch (err) {
    if (
      err instanceof CashfreeApiError &&
      err.cashfreeCode === CASHFREE_ORDER_ALREADY_EXISTS_CODE
    ) {
      // Lost the race: a concurrent call for this same Payment already
      // created this exact order_id at Cashfree between our read of
      // `payment.gatewayReferenceId` above and this create call. Fetch
      // what the winning call created and continue as if we had reused
      // it via the branch above, instead of failing this request.
      order = await fetchCashfreeOrder(cashfreeOrderId);
    } else {
      throw err;
    }
  }

  // The winning call's attachGatewayOrder may already have run (or may
  // be about to). This write is a plain field-set keyed by `payment.id`,
  // so a redundant repeat of it here is a safe no-op — it just persists
  // the same gatewayReferenceId a second time rather than corrupting
  // state, matching this function's existing idempotent-by-design intent.
  const updated = await paymentService.attachGatewayOrder(
    payment.id,
    CASHFREE_GATEWAY_NAME,
    order.order_id
  );

  return { orderId: order.order_id, paymentSessionId: order.payment_session_id, payment: updated };
}

/**
 * Checks a payment's live status directly against Cashfree's server
 * (Get Order API) and reconciles this app's own Payment record from it.
 * This — not any client-supplied value — is the source of truth this
 * endpoint trusts, per this step's "never trust a client-provided
 * SUCCESS status" requirement.
 */
export async function checkCashfreePaymentStatus(
  userId: string,
  paymentId: string
): Promise<PaymentResult> {
  const payment = await paymentService.getPaymentById(userId, paymentId);
  return reconcilePaymentStatusFromCashfree(payment);
}

/**
 * The actual Cashfree-is-truth reconciliation logic behind
 * checkCashfreePaymentStatus above — extracted (Step 42) purely so admin
 * reconciliation (reconcilePaymentForAdmin below) can reuse the exact
 * same Get Order call + status mapping + shouldApplyStatus guard without
 * duplicating any Cashfree API logic. Behavior is unchanged from what
 * checkCashfreePaymentStatus did inline before this extraction: a no-op
 * when no Cashfree order exists yet, and otherwise gated entirely by
 * shouldApplyStatus (so a locked SUCCESS/REFUNDED payment is never
 * downgraded, and a true duplicate re-check is a safe no-op).
 */
async function reconcilePaymentStatusFromCashfree(payment: PaymentResult): Promise<PaymentResult> {
  if (!payment.gatewayReferenceId) {
    // No Cashfree order has been created for this payment yet — nothing
    // to reconcile against, just return the payment as-is.
    return payment;
  }

  const order = await fetchCashfreeOrder(payment.gatewayReferenceId);
  return applyOrderStatusToPayment(payment, order);
}

/**
 * Step 47 — the actual "map this already-fetched order's status onto this
 * Payment" logic behind reconcilePaymentStatusFromCashfree above, split
 * out so a caller that has *already* called fetchCashfreeOrder for other
 * reasons (createCashfreeOrderForPayment's non-ACTIVE-order branch below)
 * can reconcile from that same response instead of issuing a second,
 * redundant Get Order call. Behavior/guard is identical to what
 * reconcilePaymentStatusFromCashfree did inline before this split:
 * gated entirely by shouldApplyStatus, so a locked SUCCESS/REFUNDED
 * payment is never downgraded and a true duplicate is a safe no-op.
 */
async function applyOrderStatusToPayment(
  payment: PaymentResult,
  order: CashfreeOrderEntity
): Promise<PaymentResult> {
  const mapped = mapCashfreeOrderStatus(order.order_status as CashfreeOrderStatus);

  if (mapped === null || !shouldApplyStatus(payment, mapped)) {
    return payment;
  }

  return paymentService.updatePaymentStatus(payment.id, { status: mapped });
}

/**
 * Initiates a refund for an existing SUCCESS Payment (Step 41). Scoped
 * to the calling user via paymentService.getPaymentById (same
 * IDOR-safe ownership check every other payment operation uses) — a
 * user can only ever request a refund of their own payment.
 *
 * Enforces, in order:
 * 1. The payment itself must be SUCCESS — INITIATED/PENDING/FAILED/
 *    CANCELLED payments were never actually captured, so there is
 *    nothing to refund; REFUNDED means it already happened.
 * 2. A refund already SUCCESS (or the payment already REFUNDED) is
 *    rejected outright (409) — refunds are one-shot.
 * 3. A refund already PENDING is *not* re-initiated — this call is
 *    idempotent for a genuinely duplicate/retried request, re-checking
 *    the live status at Cashfree instead of creating a second refund
 *    attempt against the same order.
 * 4. Only once those pass does it check isRelatedEntityCancelled — a
 *    refund is only eligible once the underlying WorkRequest/
 *    TractorBooking/TransportBooking/Order has actually been cancelled
 *    through that module's own existing cancel flow.
 *
 * The refund amount is always `payment.amount` — the input carries only
 * an optional free-text `reason`, never an amount, so a client can never
 * influence how much is refunded.
 */
export async function initiateRefund(
  userId: string,
  paymentId: string,
  input: InitiateRefundInput
): Promise<PaymentResult> {
  const payment = await paymentService.getPaymentById(userId, paymentId);

  if (payment.status === PaymentStatus.REFUNDED || payment.refundStatus === RefundStatus.SUCCESS) {
    throw new AppError(ALREADY_REFUNDED_MESSAGE, 409);
  }

  if (payment.status !== PaymentStatus.SUCCESS) {
    throw new AppError(PAYMENT_NOT_REFUNDABLE_MESSAGE, 409);
  }

  if (payment.refundStatus === RefundStatus.PENDING) {
    return checkCashfreeRefundStatus(userId, paymentId);
  }

  const eligible = await isRelatedEntityCancelled(
    payment.relatedEntityType,
    payment.relatedEntityId
  );
  if (!eligible) {
    throw new AppError(REFUND_NOT_ELIGIBLE_MESSAGE, 409);
  }

  if (!payment.gatewayReferenceId) {
    // Defensive — a SUCCESS payment always has a gatewayReferenceId set
    // (attachGatewayOrder runs before any webhook/status-check can ever
    // mark a payment SUCCESS), but this guards explicitly rather than
    // calling Cashfree with an undefined order id.
    throw new AppError(PAYMENT_NOT_REFUNDABLE_MESSAGE, 409);
  }

  // Cashfree refund_id: same constraints/reasoning as the order_id
  // prefix in createCashfreeOrderForPayment above — deterministic per
  // Payment, which also makes it Cashfree's own idempotency key for this
  // endpoint on top of this app's refundStatus guard.
  const cashfreeRefundId = `rf-${payment.id}`;

  const refund: CashfreeRefundEntity = await createCashfreeRefund(payment.gatewayReferenceId, {
    refund_id: cashfreeRefundId,
    refund_amount: payment.amount,
    refund_note: input.reason,
  });

  const updated = await paymentService.attachRefund(
    payment.id,
    payment.amount,
    input.reason,
    refund.refund_id
  );

  const mapped = mapCashfreeRefundStatus(refund.refund_status as CashfreeRefundStatus);
  if (mapped === null || !shouldApplyRefundStatus(updated, mapped)) {
    return updated;
  }

  return paymentService.updateRefundStatus(updated.id, { refundStatus: mapped });
}

/**
 * Checks a refund's live status directly against Cashfree's server (Get
 * Refund API) and reconciles this app's own Payment record from it —
 * the refund equivalent of checkCashfreePaymentStatus above, same
 * server-is-truth reasoning. A no-op (returns the payment unchanged) if
 * no refund has been initiated for this payment yet.
 */
export async function checkCashfreeRefundStatus(
  userId: string,
  paymentId: string
): Promise<PaymentResult> {
  const payment = await paymentService.getPaymentById(userId, paymentId);
  return reconcileRefundStatusFromCashfree(payment);
}

/**
 * The actual Cashfree-is-truth reconciliation logic behind
 * checkCashfreeRefundStatus above — extracted (Step 42) for the same
 * reason as reconcilePaymentStatusFromCashfree: lets admin reconciliation
 * reuse the exact same Get Refund call + status mapping +
 * shouldApplyRefundStatus guard without duplicating any Cashfree API
 * logic. Behavior is unchanged from what checkCashfreeRefundStatus did
 * inline before this extraction.
 */
async function reconcileRefundStatusFromCashfree(payment: PaymentResult): Promise<PaymentResult> {
  if (!payment.gatewayRefundId || !payment.gatewayReferenceId) {
    return payment;
  }

  const refund = await fetchCashfreeRefund(payment.gatewayReferenceId, payment.gatewayRefundId);
  const mapped = mapCashfreeRefundStatus(refund.refund_status as CashfreeRefundStatus);

  if (mapped === null || !shouldApplyRefundStatus(payment, mapped)) {
    return payment;
  }

  return paymentService.updateRefundStatus(payment.id, { refundStatus: mapped });
}

/**
 * Admin Payment Dashboard & Reconciliation (Step 42) — the admin-only
 * counterpart to checkCashfreePaymentStatus/checkCashfreeRefundStatus
 * above. Unscoped to any calling user's own id (an admin must be able to
 * reconcile any payment, not just their own) — looked up via
 * paymentService.getPaymentByIdUnscoped, which 404s if the payment
 * doesn't exist at all, same as every other *_NOT_FOUND pattern in this
 * codebase.
 *
 * Reuses reconcilePaymentStatusFromCashfree and
 * reconcileRefundStatusFromCashfree verbatim — no new Cashfree API call,
 * no new status mapping, and no new duplicate/out-of-order guard is
 * introduced here, and neither user-facing function above is changed in
 * behavior. Runs the payment-status reconciliation first, then (against
 * whatever the payment's state is *after* that write) the refund
 * reconciliation, so a payment that both settled and was refunded since
 * it was last checked reconciles fully in one call. Both steps
 * independently no-op via shouldApplyStatus/shouldApplyRefundStatus for a
 * payment already locked at SUCCESS/REFUNDED — this endpoint can never
 * downgrade a completed sale or a completed refund, exactly as for the
 * user-facing versions. Never trusts any client-supplied status: the
 * only inputs are the payment id and whatever Cashfree's server returns.
 */
export async function reconcilePaymentForAdmin(paymentId: string): Promise<PaymentResult> {
  const payment = await paymentService.getPaymentByIdUnscoped(paymentId);
  const afterPaymentReconcile = await reconcilePaymentStatusFromCashfree(payment);
  return reconcileRefundStatusFromCashfree(afterPaymentReconcile);
}

/**
 * Reconciles an incoming Cashfree *refund* webhook event
 * (REFUND_STATUS_WEBHOOK) — the refund equivalent of the payment webhook
 * branch inside handleCashfreeWebhook below, extracted into its own
 * function purely to keep that function's payment-webhook branch exactly
 * as it was before this step. Looked up by gatewayRefundId (not
 * gatewayReferenceId), since a refund event doesn't necessarily carry
 * this app's own Payment id anywhere else.
 */
async function handleRefundWebhookEvent(
  refundId: string,
  cashfreeRefundStatus: CashfreeRefundStatus
): Promise<PaymentResult | null> {
  const payment = await paymentService.getPaymentByGatewayRefundId(refundId);
  if (!payment) {
    logger.warn(WEBHOOK_REFUND_UNKNOWN, { refundId });
    return null;
  }

  const mapped = mapCashfreeRefundStatus(cashfreeRefundStatus);
  if (mapped === null) {
    return payment;
  }

  if (!shouldApplyRefundStatus(payment, mapped)) {
    return payment;
  }

  return paymentService.updateRefundStatus(payment.id, { refundStatus: mapped });
}

/**
 * Verifies and processes an incoming Cashfree webhook. Returns the
 * updated Payment (or the existing one, unchanged, if the event was a
 * duplicate/no-op/unrecognized) so the controller can log what
 * happened — the HTTP response back to Cashfree is always a plain 200
 * regardless, to avoid triggering Cashfree's retry mechanism for
 * situations we've already handled or intentionally ignore.
 */
export async function handleCashfreeWebhook(
  rawBody: Buffer,
  timestamp: string,
  signature: string
): Promise<PaymentResult | null> {
  if (!verifyCashfreeWebhookSignature(rawBody, timestamp, signature)) {
    // Invalid signature -> this did not genuinely come from Cashfree.
    // Never touch any Payment row on the strength of an unverified body.
    throw new AppError("Invalid webhook signature", 401);
  }

  let parsed: CashfreeWebhookPayload;
  try {
    parsed = JSON.parse(rawBody.toString("utf8")) as CashfreeWebhookPayload;
  } catch {
    throw new AppError("Malformed webhook payload", 400);
  }

  // Step 41: Cashfree's REFUND_STATUS_WEBHOOK carries a `data.refund`
  // block instead of `data.payment` — checked first and returned early
  // so the existing payment-webhook branch below (Step 35, untouched)
  // never has to reason about refund payloads at all.
  const webhookRefundId = parsed.data?.refund?.refund_id;
  const cashfreeRefundStatus = parsed.data?.refund?.refund_status as
    | CashfreeRefundStatus
    | undefined;

  if (webhookRefundId && cashfreeRefundStatus) {
    return handleRefundWebhookEvent(webhookRefundId, cashfreeRefundStatus);
  }

  const webhookOrderId = parsed.data?.order?.order_id;
  const cfPaymentId = parsed.data?.payment?.cf_payment_id;
  const cashfreePaymentStatus = parsed.data?.payment?.payment_status as
    | CashfreePaymentStatus
    | undefined;

  if (!webhookOrderId || !cashfreePaymentStatus) {
    // Not a payment-status webhook this foundation step handles (e.g. a
    // refund/dispute/settlement event) — acknowledge and ignore, rather
    // than erroring, so Cashfree doesn't keep retrying an event type we
    // deliberately don't act on yet.
    return null;
  }

  const payment = await paymentService.getPaymentByGatewayReferenceId(webhookOrderId);
  if (!payment) {
    logger.warn(WEBHOOK_ORDER_UNKNOWN, { orderId: webhookOrderId });
    return null;
  }

  const mapped = mapCashfreePaymentStatus(cashfreePaymentStatus);
  if (mapped === null) {
    return payment;
  }

  if (!shouldApplyStatus(payment, mapped, cfPaymentId)) {
    return payment;
  }

  return paymentService.updatePaymentStatus(payment.id, {
    status: mapped,
    gatewayPaymentId: cfPaymentId,
    failureReason: mapped === PaymentStatus.FAILED ? "Payment failed at Cashfree" : undefined,
  });
}
