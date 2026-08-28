// Fixed, application-enforced allow-list of Payment "purpose" strings —
// the coarse business reason a payment exists. Payment.purpose is stored
// as a plain String column (not a Prisma enum, see schema.prisma)
// precisely so this list can grow as new payable flows are wired up
// (e.g. a future platform-fee or subscription payment) without a
// migration — same reasoning as NOTIFICATION_TYPES in
// constants/notification.ts.
//
// Step 34 is a foundation step only: nothing yet calls
// createPaymentRecord() with any of these for a real payment. They are
// named ahead of the modules a payment will eventually be collected
// for (WorkRequest, TractorBooking, TransportBooking, produce Order),
// plus OTHER as a catch-all for anything not yet named.
export const PAYMENT_PURPOSES = [
  "WORK_REQUEST_PAYMENT",
  "TRACTOR_BOOKING_PAYMENT",
  "TRANSPORT_BOOKING_PAYMENT",
  "PRODUCE_ORDER_PAYMENT",
  "OTHER",
] as const;

export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

// Fixed allow-list for the optional relatedEntityType/relatedEntityId
// pair on Payment — identifies which table relatedEntityId points into.
// Same reasoning and shape as NOTIFICATION_ENTITY_TYPES in
// constants/notification.ts: a plain validated String, extended here as
// new modules start passing a related entity through
// createPaymentRecord().
export const PAYMENT_RELATED_ENTITY_TYPES = [
  "WORK_REQUEST",
  "TRACTOR_BOOKING",
  "TRANSPORT_BOOKING",
  "ORDER",
] as const;

export type PaymentRelatedEntityType = (typeof PAYMENT_RELATED_ENTITY_TYPES)[number];

// Cashfree Payment Gateway integration (Step 35). Cashfree's own
// `payment_status` values (returned by both the Get Order API and the
// payment webhook payload) — see
// https://www.cashfree.com/docs/api-reference/payments/latest/payments/webhooks.
// Kept as an allow-list here (not a Prisma enum) purely so
// cashfree.service.ts / cashfreePayment.service.ts can validate an
// incoming value before mapping it to our own PaymentStatus enum.
export const CASHFREE_PAYMENT_STATUSES = [
  "SUCCESS",
  "NOT_ATTEMPTED",
  "FAILED",
  "USER_DROPPED",
  "VOID",
  "CANCELLED",
  "PENDING",
] as const;

export type CashfreePaymentStatus = (typeof CASHFREE_PAYMENT_STATUSES)[number];

// Cashfree's order-level `order_status` values, returned by the Get
// Order API (used for the "check payment status" endpoint, which
// reconciles from Cashfree's server rather than trusting any
// client-supplied value).
export const CASHFREE_ORDER_STATUSES = [
  "ACTIVE",
  "PAID",
  "EXPIRED",
  "TERMINATED",
  "TERMINATION_REQUESTED",
] as const;

export type CashfreeOrderStatus = (typeof CASHFREE_ORDER_STATUSES)[number];

// Step 41 — Refunds. Cashfree's own `refund_status` values (returned by
// both the Create Refund and Get Refund APIs, and the refund webhook
// payload). Kept as an allow-list here for the same reason
// CASHFREE_PAYMENT_STATUSES is above: validated before mapping to this
// app's own RefundStatus enum.
export const CASHFREE_REFUND_STATUSES = ["PENDING", "SUCCESS", "CANCELLED"] as const;

export type CashfreeRefundStatus = (typeof CASHFREE_REFUND_STATUSES)[number];
