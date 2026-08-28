import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import * as paymentService from "./payment.service";
import * as cashfreePaymentService from "./cashfreePayment.service";
import { CreateCashfreeOrderInput } from "../validators/payment.validator";

/**
 * Wires the existing Order model (Step 23 — Marketplace/Produce Order)
 * to the existing Payment / Cashfree foundation (Step 34/35), mirroring
 * transportBookingPayment.service.ts (Step 38) /
 * tractorBookingPayment.service.ts (Step 37) /
 * workRequestPayment.service.ts (Step 36) for the Marketplace flow. This
 * is the only place a Payment row gets created *for* an Order —
 * everything else (amount sourcing, gateway order creation, status
 * reconciliation, the webhook) is delegated straight to
 * payment.service.ts / cashfreePayment.service.ts, unchanged.
 *
 * Unlike WorkRequest/TractorBooking/TransportBooking (a flat PENDING ->
 * ACCEPTED/REJECTED/CANCELLED lifecycle where payment naturally gates on
 * ACCEPTED), an Order already only ever exists post-acceptance — it is
 * created automatically the instant a ProduceOffer is ACCEPTED (see
 * order.service.ts:createOrderFromAcceptedOffer) — and then moves
 * forward through a longer fulfilment pipeline (PENDING -> CONFIRMED ->
 * READY -> PICKUP -> DELIVERED -> COMPLETED, or CANCELLED). So the
 * payable window here is "any non-terminal Order status" rather than one
 * specific status — see PAYABLE_ORDER_STATUSES below.
 *
 * Buyer verification: a ProduceOffer can only be created by a
 * buyerVerification.service.ts-verified buyer (see
 * produceOffer.service.ts:createProduceOffer's assertBuyerVerified
 * call), and an Order can only ever come from an ACCEPTED offer — so by
 * the time an Order exists, its buyer was already verified. This module
 * deliberately does not re-check verification (mirrors: nothing here
 * re-derives or bypasses that gate, it simply relies on it already
 * having been enforced upstream, per this step's "preserve — do not
 * bypass" instruction).
 *
 * Deliberately out of scope here (per Step 39): Labour/Tractor/Transport
 * payment, refunds/settlements/payouts, and any change to Order's own
 * status/fulfilment lifecycle. Nothing in this module ever writes to
 * Order.status — a successful checkout only ever changes the linked
 * Payment's status; delivery/completion still requires the existing
 * farmer/buyer advanceOrder action exactly as before.
 */

const ORDER_NOT_FOUND_MESSAGE = "Order not found";
const NOT_PAYABLE_MESSAGE = "This order is not in a payable state";
const ALREADY_PAID_MESSAGE = "This order has already been paid for";
const AMOUNT_MISMATCH_MESSAGE =
  "Order amount could not be verified against its quantity and price";

// An Order can be paid for any time between its creation and its final
// outcome — COMPLETED (fulfilment finished) and CANCELLED (nothing left
// to pay for) are the only two states excluded. Mirrors
// CANCELLABLE_STATUSES's reasoning in order.service.ts, but wider: unlike
// cancellation (which locks out once READY), payment stays open through
// the rest of the forward path since a buyer may legitimately pay at any
// point before the order is fully done.
const PAYABLE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.READY,
  OrderStatus.PICKUP,
  OrderStatus.DELIVERED,
];

// Payment statuses that mean "there is already a live/complete payment
// attempt for this Order" — a new Payment record must not be created
// while one of these exists. FAILED/CANCELLED are deliberately excluded
// so a buyer whose earlier attempt failed or was abandoned can start a
// fresh one — mirrors ACTIVE_PAYMENT_STATUSES in
// transportBookingPayment.service.ts / tractorBookingPayment.service.ts /
// workRequestPayment.service.ts exactly.
const ACTIVE_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.INITIATED,
  PaymentStatus.PENDING,
  PaymentStatus.SUCCESS,
];

// Float amounts (quantity/pricePerUnit/totalAmount are all Prisma Float
// columns) can accumulate tiny rounding error, so the integrity check
// below tolerates a sub-paisa difference rather than requiring exact
// equality.
const AMOUNT_EPSILON = 0.01;

/**
 * Buyer-initiated entry point: given one of the *calling buyer's own*
 * Orders, finds-or-creates the Payment record for it and hands off to
 * the existing Cashfree order-creation service to obtain a checkout
 * session. Returns exactly what createCashfreeOrderForPayment returns
 * (orderId/paymentSessionId/payment) — no secret/credential ever passes
 * through this module, since none is ever read here.
 *
 * Ownership: scoped to `buyerId` at the Order lookup itself, so a buyer
 * can never initiate payment for an order that isn't theirs —
 * mismatched/nonexistent ids both 404, matching getOwnOrderById's
 * pattern in order.service.ts.
 *
 * Amount: always payment.amount, sourced below from the Order's own
 * `totalAmount` field — the authoritative amount frozen at order
 * creation (offer.offerPrice * offer.quantity, see
 * createOrderFromAcceptedOffer), re-verified here against the Order's
 * own quantity * pricePerUnit as a defensive integrity check before
 * being trusted. Never anything the caller of this endpoint supplies.
 *
 * Duplicates: at most one Payment in an ACTIVE_PAYMENT_STATUSES state
 * may exist per Order at a time. A SUCCESS payment blocks further
 * initiation outright (409); an INITIATED/PENDING payment is reused
 * as-is (its Cashfree order is then reused/refreshed by
 * createCashfreeOrderForPayment, which is itself idempotent).
 */
export async function initiateOrderPayment(
  buyerId: string,
  orderId: string,
  input: CreateCashfreeOrderInput
): Promise<{
  orderId: string;
  paymentSessionId: string | undefined;
  payment: paymentService.PaymentResult;
}> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId },
    select: { id: true, status: true, quantity: true, pricePerUnit: true, totalAmount: true },
  });

  if (!order) {
    throw new AppError(ORDER_NOT_FOUND_MESSAGE, 404);
  }

  if (!PAYABLE_ORDER_STATUSES.includes(order.status)) {
    throw new AppError(NOT_PAYABLE_MESSAGE, 409);
  }

  // Defensive server-side re-verification of the authoritative amount:
  // totalAmount was computed and frozen at order creation from the
  // accepted offer's own quantity/price (createOrderFromAcceptedOffer),
  // never from client input — this just confirms it still matches the
  // Order's own quantity * pricePerUnit before it is used to charge the
  // buyer, rather than trusting the stored column blindly.
  const expectedAmount = order.quantity * order.pricePerUnit;
  if (Math.abs(expectedAmount - order.totalAmount) > AMOUNT_EPSILON) {
    throw new AppError(AMOUNT_MISMATCH_MESSAGE, 500);
  }

  // Step 45: the existing-active-payment check and the create-if-absent
  // insert run inside one Serializable transaction — see
  // paymentService.runInSerializableTransaction's doc comment — so two
  // concurrent calls for this same Order can never both see "no active
  // payment yet" and both create one.
  const paymentId = await paymentService.runInSerializableTransaction(async (tx) => {
    const existingPayment = await tx.payment.findFirst({
      where: {
        relatedEntityType: "ORDER",
        relatedEntityId: order.id,
        status: { in: ACTIVE_PAYMENT_STATUSES },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    });

    if (existingPayment?.status === PaymentStatus.SUCCESS) {
      throw new AppError(ALREADY_PAID_MESSAGE, 409);
    }

    if (existingPayment) {
      return existingPayment.id;
    }

    const created = await paymentService.createPaymentRecord(
      {
        userId: buyerId,
        // Authoritative amount: the Order's own totalAmount, sanity
        // checked above. Never derived from — or overridable by —
        // anything in `input`, which only carries Cashfree
        // customer-contact fields.
        amount: order.totalAmount,
        currency: "INR",
        purpose: "PRODUCE_ORDER_PAYMENT",
        relatedEntityType: "ORDER",
        relatedEntityId: order.id,
      },
      tx
    );
    return created.id;
  });

  // Delegates entirely to the existing Step 35 flow: amount/currency are
  // re-read from the Payment row it fetches (never from `input`), it
  // enforces the same buyerId ownership check again via
  // paymentService.getPaymentById, and it reuses an existing Cashfree
  // order rather than creating a second one if called again.
  return cashfreePaymentService.createCashfreeOrderForPayment(buyerId, paymentId, input);
}
