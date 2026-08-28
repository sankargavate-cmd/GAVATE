import { OrderStatus } from "@prisma/client";
import { z } from "zod";

// Mirrors the OrderStatus enum in schema.prisma — used for query-param
// filtering.
const ORDER_STATUSES = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

// Optional context for a forward-path status change (e.g. a farmer's note
// when marking an order READY). Mirrors messageField in
// transportBooking.validator.ts / produceOffer.validator.ts.
const noteField = z.string().trim().max(500, "note must be at most 500 characters").optional();

// Optional reason for a cancellation. Same shape/bounds as noteField, kept
// as a separate field name so the API surface reads clearly at the call
// site (cancel with a `reason`, advance with a `note`).
const reasonField = z
  .string()
  .trim()
  .max(500, "reason must be at most 500 characters")
  .optional();

// Body for PATCH /orders/:id/advance. There is deliberately no `status`
// field here — the caller can only ever move an order to its one fixed
// next status (order.service.ts's ORDER_TRANSITIONS), never to an
// arbitrary one, so accepting a target status from the client would only
// ever be redundant or wrong.
export const advanceOrderSchema = z.object({
  note: noteField,
});

export type AdvanceOrderInput = z.infer<typeof advanceOrderSchema>;

// Body for PATCH /orders/:id/cancel.
export const cancelOrderSchema = z.object({
  reason: reasonField,
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// Shared list query for both the buyer's "my orders" view and the
// farmer's "my orders" view — which side is being listed is determined by
// the caller's role in the controller, not by this schema. Mirrors
// listProduceOffersQuerySchema.
export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
