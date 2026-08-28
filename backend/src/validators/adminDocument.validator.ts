import { z } from "zod";

// Shared pagination shape for the pending-documents listing. Same
// coercion pattern as listPendingLabourQuerySchema in
// adminLabour.validator.ts (query params always arrive as strings).
export const listPendingDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type ListPendingDocumentsQuery = z.infer<typeof listPendingDocumentsQuerySchema>;

// Body for PATCH /admin/documents/:id/reject — a reason is mandatory so
// the submitting user (and any future admin auditing this decision) knows
// why. Mirrors rejectLabourSchema in adminLabour.validator.ts.
export const rejectDocumentSchema = z.object({
  reason: z
    .string({ required_error: "reason is required" })
    .trim()
    .min(5, "reason must be at least 5 characters")
    .max(500, "reason must be at most 500 characters"),
});

export type RejectDocumentInput = z.infer<typeof rejectDocumentSchema>;

// Path param validation for :id — cuid() ids used throughout this schema.
export const documentIdParamSchema = z.object({
  id: z.string({ required_error: "id is required" }).trim().min(1, "id is required"),
});

export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;
