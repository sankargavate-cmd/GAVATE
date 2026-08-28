import { PaymentStatus, RefundStatus } from "@prisma/client";
import { z } from "zod";
import { PAYMENT_PURPOSES, PAYMENT_RELATED_ENTITY_TYPES } from "../constants/payment";

// Step 42 — Admin Payment Dashboard & Reconciliation.
//
// Mirrors the existing PaymentStatus/purpose/relatedEntityType field
// definitions in payment.validator.ts exactly (same enums, same
// allow-lists) rather than importing them, since those are declared
// `const` (not exported) in that file — duplicating the shape here
// keeps this validator self-contained the way adminManagement.validator.ts
// duplicates auth.validator.ts's password policy for the same reason.
const PAYMENT_STATUSES = Object.values(PaymentStatus) as [PaymentStatus, ...PaymentStatus[]];
const REFUND_STATUSES = Object.values(RefundStatus) as [RefundStatus, ...RefundStatus[]];

// Query params for GET /api/v1/admin/payments — every filter is optional
// so an admin can list ALL payments with no filter at all (the core
// requirement: admin visibility is never restricted to one user's
// history). page/limit coercion mirrors listMyPaymentsQuerySchema /
// listPendingFarmerQuerySchema exactly (query params always arrive as
// strings).
export const listAdminPaymentsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),

    status: z
      .enum(PAYMENT_STATUSES, {
        invalid_type_error: `status must be one of: ${PAYMENT_STATUSES.join(", ")}`,
      })
      .optional(),

    purpose: z
      .enum(PAYMENT_PURPOSES, {
        invalid_type_error: `purpose must be one of: ${PAYMENT_PURPOSES.join(", ")}`,
      })
      .optional(),

    relatedEntityType: z
      .enum(PAYMENT_RELATED_ENTITY_TYPES, {
        invalid_type_error: `relatedEntityType must be one of: ${PAYMENT_RELATED_ENTITY_TYPES.join(", ")}`,
      })
      .optional(),

    refundStatus: z
      .enum(REFUND_STATUSES, {
        invalid_type_error: `refundStatus must be one of: ${REFUND_STATUSES.join(", ")}`,
      })
      .optional(),

    // Restricts the listing to one payer — this is what lets an admin
    // still drill into a single user's history while the *default*
    // (userId omitted) remains every payment across every user.
    userId: z.string().trim().min(1).optional(),

    // Partial, case-insensitive match — an admin reconciling against a
    // Cashfree dashboard export typically has one of these two ids, not
    // necessarily the exact stored value's casing.
    gatewayReferenceId: z.string().trim().min(1).max(200).optional(),
    gatewayPaymentId: z.string().trim().min(1).max(200).optional(),

    // Inclusive createdAt range. z.coerce.date() accepts any
    // Date-parseable query string (e.g. "2026-08-01"); an invalid string
    // fails validation here rather than silently matching nothing.
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: "dateFrom must be on or before dateTo",
    path: ["dateFrom"],
  });

export type ListAdminPaymentsQuery = z.infer<typeof listAdminPaymentsQuerySchema>;

// Path param validation for :id — cuid() ids used throughout this
// codebase. Mirrors farmerProfileIdParamSchema / adminIdParamSchema.
export const adminPaymentIdParamSchema = z.object({
  id: z.string({ required_error: "id is required" }).trim().min(1, "id is required"),
});

export type AdminPaymentIdParam = z.infer<typeof adminPaymentIdParamSchema>;
