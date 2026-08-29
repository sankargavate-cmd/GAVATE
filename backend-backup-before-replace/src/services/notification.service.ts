import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { logger } from "../utils/logger";
import {
  CreateBulkNotificationsInput,
  createBulkNotificationsSchema,
  CreateNotificationInput,
  createNotificationSchema,
  ListNotificationsQuery,
} from "../validators/notification.validator";

const NOTIFICATION_NOT_FOUND_MESSAGE = "Notification not found or does not belong to you";
const INVALID_NOTIFICATION_PAYLOAD_MESSAGE = "Invalid notification payload";

// Shared response shape, mirrors the *_SELECT constants pattern used
// throughout this codebase (e.g. RATING_SELECT in rating.service.ts).
const NOTIFICATION_SELECT = {
  id: true,
  recipientId: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  readAt: true,
  relatedEntityType: true,
  relatedEntityId: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationResult = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

export interface PaginatedNotifications {
  items: NotificationResult[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  // Total unread count for the recipient — independent of the current
  // page/filter, so a bell-icon badge can always show the true total
  // even while viewing page 2 or an unreadOnly-filtered view.
  unreadCount: number;
}

/**
 * Creates a single notification for one recipient. This is the one
 * function every future module (Labour, Tractor, Transport, Buyer,
 * Order, Payment, KYC, ...) is expected to call whenever a user needs to
 * be notified in-app — it is intentionally the only place Notification
 * rows get written (besides createBulkNotifications below), so read
 * behavior (list/unread-count/mark-as-read) stays consistent no matter
 * which module triggered the notification.
 *
 * Validates its input even though callers are internal (not HTTP
 * request bodies) — see createNotificationSchema's doc comment — so a
 * caller passing e.g. an unregistered `type` fails loudly here rather
 * than silently writing a row no allow-listed UI knows how to render.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationResult> {
  const parsed = createNotificationSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(INVALID_NOTIFICATION_PAYLOAD_MESSAGE, 500, parsed.error.flatten().fieldErrors);
  }

  const { recipientId, type, title, message, relatedEntityType, relatedEntityId } = parsed.data;

  return prisma.notification.create({
    data: { recipientId, type, title, message, relatedEntityType, relatedEntityId },
    select: NOTIFICATION_SELECT,
  });
}

/**
 * Creates the same notification (title/message/type/relatedEntity) for
 * many recipients at once — e.g. notifying every ADMIN of a new KYC
 * submission. Uses createMany rather than looping createNotification()
 * for efficiency; returns only a count (Prisma's createMany does not
 * return the created rows), which is enough for a fire-and-forget
 * notify-many call.
 */
export async function createBulkNotifications(
  input: CreateBulkNotificationsInput
): Promise<{ count: number }> {
  const parsed = createBulkNotificationsSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(INVALID_NOTIFICATION_PAYLOAD_MESSAGE, 500, parsed.error.flatten().fieldErrors);
  }

  const { recipientIds, type, title, message, relatedEntityType, relatedEntityId } = parsed.data;

  return prisma.notification.createMany({
    data: recipientIds.map((recipientId) => ({
      recipientId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
    })),
  });
}

/**
 * Step 33 — Notification Event Integration.
 *
 * Fire-and-forget wrapper around createNotification() for call sites that
 * live inside another module's business flow (a new work request, a
 * booking accept/reject, a KYC decision, a new rating, ...) and must not
 * let a notification failure break that flow. Every error — schema
 * validation, a database error, anything — is caught and logged here
 * rather than propagated, so the caller's own transaction/response is
 * never affected by the notification subsystem being down or misused.
 *
 * Deliberately the *only* place besides createNotification/
 * createBulkNotifications themselves that touches notification creation,
 * so business-flow modules never duplicate creation logic — they just
 * build the input and call this.
 */
export async function notifySafely(input: CreateNotificationInput): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    logger.error("Failed to create notification (business flow unaffected)", {
      recipientId: input.recipientId,
      type: input.type,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Paginated list of the calling user's own notifications, most recent
 * first, alongside their total unread count. unreadOnly narrows the
 * page/total to unread rows only, but unreadCount always reflects the
 * recipient's true total unread — independent of unreadOnly/page — so a
 * badge stays correct regardless of which view is open.
 */
export async function getMyNotifications(
  recipientId: string,
  query: ListNotificationsQuery
): Promise<PaginatedNotifications> {
  const { page, limit, unreadOnly } = query;

  const where: Prisma.NotificationWhereInput = {
    recipientId,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [items, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientId, isRead: false } }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    unreadCount,
  };
}

/**
 * Marks one of the calling user's own notifications as read. Scoped by
 * recipientId (not just id) so a user can never mark — or even discover
 * the existence of — another user's notification; a mismatched id 404s
 * the same as a nonexistent one. Idempotent: marking an already-read
 * notification again is a no-op that returns it unchanged, rather than
 * overwriting readAt with a later timestamp.
 */
export async function markAsRead(recipientId: string, id: string): Promise<NotificationResult> {
  const existing = await prisma.notification.findFirst({
    where: { id, recipientId },
    select: NOTIFICATION_SELECT,
  });

  if (!existing) {
    throw new AppError(NOTIFICATION_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.isRead) {
    return existing;
  }

  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
    select: NOTIFICATION_SELECT,
  });
}

/**
 * Marks every currently-unread notification belonging to the calling
 * user as read in one batch update. Returns how many rows were updated
 * (0 if the user had none unread).
 */
export async function markAllAsRead(recipientId: string): Promise<{ count: number }> {
  return prisma.notification.updateMany({
    where: { recipientId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}
