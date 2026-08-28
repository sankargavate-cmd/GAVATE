import { PaymentStatus, RefundStatus } from "@prisma/client";
import { z } from "zod";
import { PAYMENT_PURPOSES, PAYMENT_RELATED_ENTITY_TYPES } from "../constants/payment";

// Mirrors RATING_TARGET_TYPES in rating.validator.ts — Object.values()
// cast to the non-empty tuple shape z.enum requires. PaymentStatus is a
// genuine Prisma enum (see schema.prisma), unlike purpose/
// relatedEntityType below.
const PAYMENT_STATUSES = Object.values(PaymentStatus) as [PaymentStatus, ...PaymentStatus[]];

const statusField = z.enum(PAYMENT_STATUSES, {
  required_error: "status is required",
  invalid_type_error: `status must be one of: ${PAYMENT_STATUSES.join(", ")}`,
});

const purposeField = z.enum(PAYMENT_PURPOSES, {
  required_error: "purpose is required",
  invalid_type_error: `purpose must be one of: ${PAYMENT_PURPOSES.join(", ")}`,
});

const relatedEntityTypeField = z.enum(PAYMENT_RELATED_ENTITY_TYPES, {
  invalid_type_error: `relatedEntityType must be one of: ${PAYMENT_RELATED_ENTITY_TYPES.join(", ")}`,
});

const relatedEntityIdField = z.string().trim().min(1).optional();

const amountField = z
  .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
  .positive("amount must be greater than 0");

// ISO 4217-style 3-letter currency code, uppercased. Defaulted to INR at
// the schema level (see Payment.currency in schema.prisma) — repeated
// here as an explicit default too so a caller that omits it entirely
// still gets a validated, uppercase value back from parsed data rather
// than relying on the DB default alone.
const currencyField = z
  .string()
  .trim()
  .length(3, "currency must be a 3-letter ISO 4217 code")
  .transform((value) => value.toUpperCase())
  .default("INR");

const gatewayNameField = z.string().trim().min(1).max(50).optional();
const gatewayReferenceIdField = z.string().trim().min(1).max(200).optional();
const gatewayPaymentIdField = z.string().trim().min(1).max(200).optional();
const failureReasonField = z.string().trim().min(1).max(500).optional();

// Not an HTTP-facing schema — this validates the payload
// payment.service.ts's createPaymentRecord() receives from *calling
// code* (future modules: WorkRequest, TractorBooking, TransportBooking,
// Order checkout, ...), not a request body. Kept as a zod schema anyway
// (rather than a bare TS interface) so a malformed internal call fails
// loudly with a clear message instead of silently writing bad data,
// matching createNotificationSchema's identical reasoning in
// notification.validator.ts.
export const createPaymentRecordSchema = z
  .object({
    userId: z.string({ required_error: "userId is required" }).trim().min(1),
    amount: amountField,
    currency: currencyField,
    purpose: purposeField,
    relatedEntityType: relatedEntityTypeField.optional(),
    relatedEntityId: relatedEntityIdField,
    gatewayName: gatewayNameField,
    gatewayReferenceId: gatewayReferenceIdField,
    gatewayPaymentId: gatewayPaymentIdField,
  })
  .refine(
    (data) => (data.relatedEntityType === undefined) === (data.relatedEntityId === undefined),
    {
      message: "relatedEntityType and relatedEntityId must be provided together",
      path: ["relatedEntityId"],
    }
  );

export type CreatePaymentRecordInput = z.infer<typeof createPaymentRecordSchema>;

// Not an HTTP-facing schema either — validates updatePaymentStatus()'s
// payload the same way createPaymentRecordSchema does above. No
// gateway/checkout step calls this yet (Step 34 foundation only), but
// it's what a future gateway-webhook handler or checkout-poll will call
// once one exists.
export const updatePaymentStatusSchema = z.object({
  status: statusField,
  gatewayPaymentId: gatewayPaymentIdField,
  failureReason: failureReasonField,
});

export type UpdatePaymentStatusInput = z.infer<typeof updatePaymentStatusSchema>;

// Query params for GET /api/v1/payments/me. Mirrors
// listNotificationsQuerySchema (notification.validator.ts): page/limit
// as coerced positive ints with the same defaults/cap, plus an optional
// status filter for callers that only want one lifecycle state.
export const listMyPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  status: statusField.optional(),
});

export type ListMyPaymentsQuery = z.infer<typeof listMyPaymentsQuerySchema>;

// HTTP-facing schema for POST /api/v1/payments/:id/cashfree/order (Step
// 35). Cashfree's Create Order API requires customer_phone (10 digits)
// at minimum; this module deliberately does not read a phone number off
// FarmerProfile/LabourProfile/etc. (those are role-specific and a BUYER
// has no profile row at all — see User.payments' doc comment in
// schema.prisma), so the caller supplies it directly. This keeps the
// Cashfree foundation fully decoupled from every other module, per this
// step's scope.
export const createCashfreeOrderSchema = z.object({
  customerPhone: z
    .string({ required_error: "customerPhone is required" })
    .trim()
    .regex(/^\d{10}$/, "customerPhone must be exactly 10 digits"),
  customerName: z.string().trim().min(3).max(100).optional(),
  customerEmail: z.string().trim().email().optional(),
});

export type CreateCashfreeOrderInput = z.infer<typeof createCashfreeOrderSchema>;

// Step 41 — Refunds/Cancellation Handling.

// Not an HTTP-facing schema — validates
// payment.service.ts's updateRefundStatus() payload the same way
// updatePaymentStatusSchema does above. Called by the refund webhook
// handler and the manual refund-status-check endpoint
// (cashfreePayment.service.ts), never directly from a request body.
const REFUND_STATUSES = Object.values(RefundStatus) as [RefundStatus, ...RefundStatus[]];

export const updateRefundStatusSchema = z.object({
  refundStatus: z.enum(REFUND_STATUSES, {
    required_error: "refundStatus is required",
    invalid_type_error: `refundStatus must be one of: ${REFUND_STATUSES.join(", ")}`,
  }),
});

export type UpdateRefundStatusInput = z.infer<typeof updateRefundStatusSchema>;

// HTTP-facing schema for POST /api/v1/payments/:id/refund. Deliberately
// carries no amount field at all — the refund amount always comes from
// the Payment's own `amount` (see cashfreePayment.service.ts's
// initiateRefund), so there is nothing here for a client to override.
// `reason` is optional, free-text, surfaced back on the Payment purely
// for the user's/support's own record-keeping.
export const initiateRefundSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export type InitiateRefundInput = z.infer<typeof initiateRefundSchema>;
