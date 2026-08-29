import { z } from "zod";
import { NOTIFICATION_ENTITY_TYPES, NOTIFICATION_TYPES } from "../constants/notification";

// Mirrors RATING_TARGET_TYPES in rating.validator.ts — Object.values()
// cast to the non-empty tuple shape z.enum requires.
const notificationTypeField = z.enum(NOTIFICATION_TYPES, {
  required_error: "type is required",
  invalid_type_error: `type must be one of: ${NOTIFICATION_TYPES.join(", ")}`,
});

const relatedEntityTypeField = z.enum(NOTIFICATION_ENTITY_TYPES, {
  invalid_type_error: `relatedEntityType must be one of: ${NOTIFICATION_ENTITY_TYPES.join(", ")}`,
});

const titleField = z
  .string({ required_error: "title is required" })
  .trim()
  .min(1, "title is required")
  .max(200, "title must be at most 200 characters");

const messageField = z
  .string({ required_error: "message is required" })
  .trim()
  .min(1, "message is required")
  .max(2000, "message must be at most 2000 characters");

const relatedEntityIdField = z.string().trim().min(1).optional();

// Not an HTTP-facing schema — this validates the payload
// notification.service.ts's createNotification() receives from *calling
// code* (future modules: Labour, Tractor, Transport, Buyer, Order,
// Payment, KYC, ...), not a request body. Kept as a zod schema anyway
// (rather than a bare TS interface) so a malformed internal call fails
// loudly with a clear message instead of silently writing bad data,
// matching how every HTTP validator in this codebase already guards its
// inputs.
export const createNotificationSchema = z
  .object({
    recipientId: z.string({ required_error: "recipientId is required" }).trim().min(1),
    type: notificationTypeField,
    title: titleField,
    message: messageField,
    relatedEntityType: relatedEntityTypeField.optional(),
    relatedEntityId: relatedEntityIdField,
  })
  .refine(
    (data) => (data.relatedEntityType === undefined) === (data.relatedEntityId === undefined),
    {
      message: "relatedEntityType and relatedEntityId must be provided together",
      path: ["relatedEntityId"],
    }
  );

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

// Same as createNotificationSchema above, but for one shared
// title/message/type/relatedEntity fanned out to many recipients in one
// call (createBulkNotifications) — e.g. notifying every ADMIN of a new
// KYC submission.
export const createBulkNotificationsSchema = z
  .object({
    recipientIds: z
      .array(z.string().trim().min(1))
      .min(1, "recipientIds must contain at least one id"),
    type: notificationTypeField,
    title: titleField,
    message: messageField,
    relatedEntityType: relatedEntityTypeField.optional(),
    relatedEntityId: relatedEntityIdField,
  })
  .refine(
    (data) => (data.relatedEntityType === undefined) === (data.relatedEntityId === undefined),
    {
      message: "relatedEntityType and relatedEntityId must be provided together",
      path: ["relatedEntityId"],
    }
  );

export type CreateBulkNotificationsInput = z.infer<typeof createBulkNotificationsSchema>;

// Query params for GET /api/notifications. Mirrors listRatingsQuerySchema
// (rating.validator.ts): page/limit as coerced positive ints with the
// same defaults/cap, plus an optional unreadOnly filter for callers that
// only want the unread subset (e.g. a bell-icon dropdown).
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
  // Accepts "true"/"false" from a query string as well as an actual
  // boolean, since query params always arrive as strings.
  unreadOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
