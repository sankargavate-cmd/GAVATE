import { PaymentStatus, WorkRequestStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import * as paymentService from "./payment.service";
import * as cashfreePaymentService from "./cashfreePayment.service";
import { CreateCashfreeOrderInput } from "../validators/payment.validator";

/**
 * Wires the existing WorkRequest model (Step 19) to the existing
 * Payment / Cashfree foundation (Step 34/35) for the Labour service
 * flow. This is the only place a Payment row gets created *for* a
 * WorkRequest — everything else (amount sourcing, gateway order
 * creation, status reconciliation, the webhook) is delegated straight
 * to payment.service.ts / cashfreePayment.service.ts, unchanged.
 *
 * Deliberately out of scope here (per Step 36): Tractor/Transport/
 * Marketplace payment, refunds/settlements, and any change to
 * WorkRequest's own PENDING/ACCEPTED/REJECTED/CANCELLED lifecycle.
 * WorkRequestStatus has no "completed" state, so nothing in this module
 * ever writes to WorkRequest.status — a successful checkout only ever
 * changes the linked Payment's status.
 */

const REQUEST_NOT_FOUND_MESSAGE = "Work request not found";
const NOT_PAYABLE_MESSAGE = "Only accepted work requests can be paid for";
const ALREADY_PAID_MESSAGE = "This work request has already been paid for";

// Payment statuses that mean "there is already a live/complete payment
// attempt for this WorkRequest" — a new Payment record must not be
// created while one of these exists. FAILED/CANCELLED are deliberately
// excluded so a farmer whose earlier attempt failed or was abandoned can
// start a fresh one, mirroring PaymentStatus's own terminal-state doc
// comment in schema.prisma (FAILED/CANCELLED are terminal but not
// "locked" the way SUCCESS/REFUNDED are).
const ACTIVE_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.INITIATED,
  PaymentStatus.PENDING,
  PaymentStatus.SUCCESS,
];

/**
 * Farmer-initiated entry point: given one of the *calling farmer's own*
 * WorkRequests, finds-or-creates the Payment record for it and hands off
 * to the existing Cashfree order-creation service to obtain a checkout
 * session. Returns exactly what createCashfreeOrderForPayment returns
 * (orderId/paymentSessionId/payment) — no secret/credential ever passes
 * through this module, since none is ever read here.
 *
 * Ownership: scoped to `farmerId` at the WorkRequest lookup itself, so a
 * farmer can never initiate payment for a request that isn't theirs —
 * mismatched/nonexistent ids both 404, matching getOwnWorkRequestById's
 * pattern in workRequest.service.ts.
 *
 * Amount: always payment.amount, sourced below from the WorkRequest's own
 * `wage` field (set at creation, never touched by the accept/reject
 * flow) — never anything the caller of this endpoint supplies.
 *
 * Duplicates: at most one Payment in an ACTIVE_PAYMENT_STATUSES state may
 * exist per WorkRequest at a time. A SUCCESS payment blocks further
 * initiation outright (409); an INITIATED/PENDING payment is reused
 * as-is (its Cashfree order is then reused/refreshed by
 * createCashfreeOrderForPayment, which is itself idempotent).
 */
export async function initiateWorkRequestPayment(
  farmerId: string,
  workRequestId: string,
  input: CreateCashfreeOrderInput
): Promise<{
  orderId: string;
  paymentSessionId: string | undefined;
  payment: paymentService.PaymentResult;
}> {
  const workRequest = await prisma.workRequest.findFirst({
    where: { id: workRequestId, farmerId },
    select: { id: true, status: true, wage: true },
  });

  if (!workRequest) {
    throw new AppError(REQUEST_NOT_FOUND_MESSAGE, 404);
  }

  // Payable only once the labour user has accepted — before that there
  // is no agreed job to pay for, and REJECTED/CANCELLED are terminal
  // states with nothing left to pay. Mirrors respondToWorkRequest's own
  // "only PENDING can be responded to" guard in workRequest.service.ts.
  if (workRequest.status !== WorkRequestStatus.ACCEPTED) {
    throw new AppError(NOT_PAYABLE_MESSAGE, 409);
  }

  // Step 45: the existing-active-payment check and the create-if-absent
  // insert run inside one Serializable transaction — see
  // paymentService.runInSerializableTransaction's doc comment — so two
  // concurrent calls for this same WorkRequest can never both see "no
  // active payment yet" and both create one.
  const paymentId = await paymentService.runInSerializableTransaction(async (tx) => {
    const existingPayment = await tx.payment.findFirst({
      where: {
        relatedEntityType: "WORK_REQUEST",
        relatedEntityId: workRequest.id,
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
        userId: farmerId,
        // Authoritative amount: the wage agreed on the WorkRequest
        // itself. Never derived from — or overridable by — anything in
        // `input`, which only carries Cashfree customer-contact fields.
        amount: workRequest.wage,
        currency: "INR",
        purpose: "WORK_REQUEST_PAYMENT",
        relatedEntityType: "WORK_REQUEST",
        relatedEntityId: workRequest.id,
      },
      tx
    );
    return created.id;
  });

  // Delegates entirely to the existing Step 35 flow: amount/currency are
  // re-read from the Payment row it fetches (never from `input`), it
  // enforces the same farmerId ownership check again via
  // paymentService.getPaymentById, and it reuses an existing Cashfree
  // order rather than creating a second one if called again.
  return cashfreePaymentService.createCashfreeOrderForPayment(farmerId, paymentId, input);
}
