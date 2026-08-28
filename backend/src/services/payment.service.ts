import { PaymentStatus, Prisma, RefundStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import {
  CreatePaymentRecordInput,
  createPaymentRecordSchema,
  ListMyPaymentsQuery,
  UpdatePaymentStatusInput,
  updatePaymentStatusSchema,
  UpdateRefundStatusInput,
  updateRefundStatusSchema,
} from "../validators/payment.validator";

const PAYMENT_NOT_FOUND_MESSAGE = "Payment not found or does not belong to you";
const PAYMENT_NOT_FOUND_MESSAGE_PLAIN = "Payment not found";
const INVALID_PAYMENT_PAYLOAD_MESSAGE = "Invalid payment payload";

/**
 * Payment Gateway foundation (Step 34).
 *
 * This module is the model + service foundation only — the reusable
 * home every future payable flow (WorkRequest, TractorBooking,
 * TransportBooking, produce Order checkout, ...) is expected to write
 * through, mirroring how notification.service.ts (Step 32) is the one
 * shared place Notification rows get written. Nothing yet calls
 * createPaymentRecord() for a real payment, no gateway (Cashfree or
 * otherwise) is connected, and no checkout flow exists — those are
 * explicitly out of scope for this step.
 */

// Shared response shape for every payment this service returns — never
// includes anything from a gateway beyond the identifiers this app
// itself needs to look a payment back up (gatewayReferenceId/
// gatewayPaymentId), never a secret/credential, since none are ever
// stored on this model in the first place. Mirrors NOTIFICATION_SELECT
// in notification.service.ts.
const PAYMENT_SELECT = {
  id: true,
  userId: true,
  amount: true,
  currency: true,
  purpose: true,
  relatedEntityType: true,
  relatedEntityId: true,
  gatewayName: true,
  gatewayReferenceId: true,
  gatewayPaymentId: true,
  status: true,
  failureReason: true,
  // Step 41 refund fields — same treatment as every other field on this
  // model: never a Cashfree secret/credential (none is ever stored
  // here), safe to return as-is in every payment response.
  refundStatus: true,
  refundAmount: true,
  refundReason: true,
  gatewayRefundId: true,
  refundedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

export type PaymentResult = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

export interface PaginatedPayments {
  items: PaymentResult[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a single Payment record for one user. This is the one function
 * every future module (WorkRequest, TractorBooking, TransportBooking,
 * Order checkout, ...) is expected to call whenever a payable action
 * needs a payment tracked — it is intentionally the only place Payment
 * rows get created, so read behavior (list/getById) and status
 * transitions (updatePaymentStatus) stay consistent no matter which
 * module triggered the payment.
 *
 * Validates its input even though callers are internal (not HTTP
 * request bodies) — see createPaymentRecordSchema's doc comment — so a
 * caller passing e.g. an unregistered `purpose` fails loudly here rather
 * than silently writing a row no future gateway integration knows how
 * to reconcile.
 */
export async function createPaymentRecord(
  input: CreatePaymentRecordInput,
  // Step 45 — optional transaction client, defaulting to the module-level
  // `prisma`. Additive: every existing caller that omits this argument
  // behaves exactly as before. Lets the four *Payment.service.ts
  // find-or-create callers (workRequest/tractorBooking/transportBooking/
  // order) run their existing-payment check and this insert inside one
  // Serializable transaction (see runInSerializableTransaction below),
  // instead of as two separate round-trips a concurrent duplicate request
  // could race between.
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<PaymentResult> {
  const parsed = createPaymentRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(INVALID_PAYMENT_PAYLOAD_MESSAGE, 500, parsed.error.flatten().fieldErrors);
  }

  const {
    userId,
    amount,
    currency,
    purpose,
    relatedEntityType,
    relatedEntityId,
    gatewayName,
    gatewayReferenceId,
    gatewayPaymentId,
  } = parsed.data;

  return tx.payment.create({
    data: {
      userId,
      amount,
      currency,
      purpose,
      relatedEntityType,
      relatedEntityId,
      gatewayName,
      gatewayReferenceId,
      gatewayPaymentId,
    },
    select: PAYMENT_SELECT,
  });
}

/**
 * Step 45 — runs `fn` inside a Serializable-isolation Prisma transaction,
 * retrying exactly once if Postgres reports a write-conflict/
 * serialization failure (Prisma error code P2034).
 *
 * Exists for the four *Payment.service.ts "find an active Payment for
 * this entity, or create one" flows (workRequestPayment.service.ts,
 * tractorBookingPayment.service.ts, transportBookingPayment.service.ts,
 * orderPayment.service.ts): under the default isolation level, two
 * concurrent calls for the *same* WorkRequest/TractorBooking/
 * TransportBooking/Order (e.g. a double-tap on "Pay Now") could both read
 * "no active payment yet" before either write lands, and both then
 * create a separate Payment row (and a separate Cashfree order) for what
 * is meant to be a single payable engagement. This is the same class of
 * race Rating already closes via a DB-level `@unique` constraint on its
 * reference FKs (see rating.service.ts's createRating doc comment) — the
 * same fix doesn't apply here as-is because "already has an active
 * payment" is a business rule over a *set* of PaymentStatus values
 * (ACTIVE_PAYMENT_STATUSES, which varies in whether SUCCESS is included)
 * rather than a fixed set of columns a plain unique constraint could
 * express, so Serializable isolation is used instead to get the same
 * "the check and the insert can never both succeed for two concurrent
 * callers" guarantee.
 *
 * A second, near-simultaneous conflict is vanishingly unlikely for a
 * genuine duplicate request (the retry runs immediately after the first
 * transaction has already committed or rolled back) and is rethrown
 * rather than retried indefinitely.
 */
export async function runInSerializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    }
    throw err;
  }
}

/**
 * Paginated list of the calling user's own payments, most recent first.
 * Scoped to `userId` unconditionally — there is no path in this service
 * for a caller to list another user's payments, so a user can only ever
 * see their own payment history.
 */
export async function getMyPayments(
  userId: string,
  query: ListMyPaymentsQuery
): Promise<PaginatedPayments> {
  const { page, limit, status } = query;

  const where: Prisma.PaymentWhereInput = {
    userId,
    ...(status ? { status } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Fetches a single payment belonging to the calling user. Scoped by
 * `userId` (not just `id`) so a user can never access — or even
 * discover the existence of — another user's payment; a mismatched id
 * 404s the same as a nonexistent one, mirroring
 * notification.service.ts's markAsRead and every *_NOT_FOUND pattern
 * elsewhere in this codebase (e.g. getOwnWorkRequestById).
 */
export async function getPaymentById(userId: string, id: string): Promise<PaymentResult> {
  const payment = await prisma.payment.findFirst({
    where: { id, userId },
    select: PAYMENT_SELECT,
  });

  if (!payment) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE, 404);
  }

  return payment;
}

/**
 * Fetches a single payment by id with no ownership scoping at all — the
 * admin-only counterpart to getPaymentById above (Step 42). Not exposed
 * through any user-facing route; only adminPayment.service.ts's
 * reconciliation and detail lookups (via cashfreePayment.service.ts's
 * reconcilePaymentForAdmin) call this. 404s identically to a nonexistent
 * id when the payment truly doesn't exist, mirroring getPaymentById's own
 * *_NOT_FOUND pattern.
 */
export async function getPaymentByIdUnscoped(id: string): Promise<PaymentResult> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: PAYMENT_SELECT,
  });

  if (!payment) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE_PLAIN, 404);
  }

  return payment;
}

/**
 * Updates a payment's lifecycle status (e.g. PENDING -> SUCCESS/FAILED),
 * optionally recording the gateway's payment id and/or a failure reason
 * as part of the same transition. Not scoped to a calling user's own id
 * — this is meant to be called by a future gateway webhook/callback
 * handler or an internal reconciliation job, neither of which acts on
 * behalf of a single logged-in user, mirroring how
 * adminDocument.service.ts's approve/reject aren't scoped to the
 * document owner either. No such caller exists yet in this step.
 */
export async function updatePaymentStatus(
  id: string,
  input: UpdatePaymentStatusInput
): Promise<PaymentResult> {
  const parsed = updatePaymentStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(INVALID_PAYMENT_PAYLOAD_MESSAGE, 500, parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE_PLAIN, 404);
  }

  const { status, gatewayPaymentId, failureReason } = parsed.data;

  return prisma.payment.update({
    where: { id },
    data: {
      status,
      ...(gatewayPaymentId !== undefined ? { gatewayPaymentId } : {}),
      // Cleared back to null whenever a non-failure status is set, so a
      // payment that later succeeds (e.g. retried after a FAILED
      // attempt) doesn't keep showing a stale reason from the earlier
      // attempt.
      failureReason: failureReason ?? null,
    },
    select: PAYMENT_SELECT,
  });
}

/**
 * Fetches a single payment by its gateway reference id (Cashfree's
 * `order_id` — see attachGatewayOrder below). Unscoped to a calling
 * user, same reasoning as updatePaymentStatus above: this is meant for
 * the gateway webhook/status-check handlers (cashfreePayment.service.ts,
 * Step 35), not a logged-in user acting on their own behalf. Returns
 * null instead of throwing when not found, since a webhook handler needs
 * to distinguish "safely ignore, this isn't ours" from "not found"
 * without necessarily raising a 404 error.
 */
export async function getPaymentByGatewayReferenceId(
  gatewayReferenceId: string
): Promise<PaymentResult | null> {
  return prisma.payment.findFirst({
    where: { gatewayReferenceId },
    select: PAYMENT_SELECT,
  });
}

/**
 * Fetches a single payment by its gateway *refund* id (Cashfree's
 * `refund_id` — see attachRefund below). Unscoped to a calling user,
 * same reasoning as getPaymentByGatewayReferenceId above: this is meant
 * for the refund webhook/status-check handlers
 * (cashfreePayment.service.ts, Step 41), not a logged-in user acting on
 * their own behalf.
 */
export async function getPaymentByGatewayRefundId(
  gatewayRefundId: string
): Promise<PaymentResult | null> {
  return prisma.payment.findFirst({
    where: { gatewayRefundId },
    select: PAYMENT_SELECT,
  });
}

/**
 * Records that a refund attempt has been created at Cashfree for this
 * Payment (Step 41) — `refundAmount`/`refundReason`/`gatewayRefundId`
 * are set once, at the point the refund is created at the gateway
 * (cashfreePayment.service.ts's initiateRefund is the only caller),
 * mirroring attachGatewayOrder's identical relationship to the original
 * payment flow. Deliberately separate from updateRefundStatus below:
 * creating a refund attempt does not by itself confirm it — refundStatus
 * starts at PENDING here and only updateRefundStatus (driven by a
 * webhook or explicit status check, never a client claim) can move it to
 * SUCCESS/FAILED.
 */
export async function attachRefund(
  id: string,
  refundAmount: number,
  refundReason: string | undefined,
  gatewayRefundId: string
): Promise<PaymentResult> {
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE_PLAIN, 404);
  }

  return prisma.payment.update({
    where: { id },
    data: {
      refundStatus: RefundStatus.PENDING,
      refundAmount,
      refundReason: refundReason ?? null,
      gatewayRefundId,
    },
    select: PAYMENT_SELECT,
  });
}

/**
 * Updates a payment's refund lifecycle (PENDING -> SUCCESS/FAILED),
 * called by the refund webhook handler or the manual refund-status-check
 * endpoint (cashfreePayment.service.ts) — never by a client-supplied
 * flag. When the refund reaches SUCCESS, also moves the payment's own
 * `status` to the existing PaymentStatus.REFUNDED (Step 34) in the same
 * write, so the payment's terminal state and its refund record can never
 * disagree with each other.
 */
export async function updateRefundStatus(
  id: string,
  input: UpdateRefundStatusInput
): Promise<PaymentResult> {
  const parsed = updateRefundStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(INVALID_PAYMENT_PAYLOAD_MESSAGE, 500, parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE_PLAIN, 404);
  }

  const { refundStatus } = parsed.data;

  return prisma.payment.update({
    where: { id },
    data: {
      refundStatus,
      ...(refundStatus === RefundStatus.SUCCESS
        ? { status: PaymentStatus.REFUNDED, refundedAt: new Date() }
        : {}),
    },
    select: PAYMENT_SELECT,
  });
}

/**
 * Records which gateway order a Payment is now associated with —
 * `gatewayName`/`gatewayReferenceId` are set once, at the point a
 * checkout attempt is created at the gateway (Step 35's
 * cashfreePayment.service.ts is the only caller). Deliberately separate
 * from updatePaymentStatus above: attaching a gateway order does not by
 * itself change the payment's lifecycle status (it stays whatever it
 * already was, typically INITIATED, until a webhook/status-check moves
 * it forward).
 */
export async function attachGatewayOrder(
  id: string,
  gatewayName: string,
  gatewayReferenceId: string
): Promise<PaymentResult> {
  const existing = await prisma.payment.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PAYMENT_NOT_FOUND_MESSAGE_PLAIN, 404);
  }

  return prisma.payment.update({
    where: { id },
    data: { gatewayName, gatewayReferenceId },
    select: PAYMENT_SELECT,
  });
}
