import { z } from "zod";

// Shared pagination shape for the pending-labour listing. Same coercion
// pattern as searchLabourQuerySchema in labour.validator.ts (query params
// always arrive as strings).
export const listPendingLabourQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type ListPendingLabourQuery = z.infer<typeof listPendingLabourQuerySchema>;

// Body for POST /admin/labour/:id/reject — a reason is mandatory so the
// labour user (and any future admin auditing this decision) knows why.
export const rejectLabourSchema = z.object({
  reason: z
    .string({ required_error: "reason is required" })
    .trim()
    .min(5, "reason must be at least 5 characters")
    .max(500, "reason must be at most 500 characters"),
});

export type RejectLabourInput = z.infer<typeof rejectLabourSchema>;

// Path param validation for :id — cuid() ids used throughout this schema.
export const labourProfileIdParamSchema = z.object({
  id: z.string({ required_error: "id is required" }).trim().min(1, "id is required"),
});

export type LabourProfileIdParam = z.infer<typeof labourProfileIdParamSchema>;
