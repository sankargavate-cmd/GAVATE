// Fixed, application-enforced allow-list of notification "type" strings.
// Notification.type is stored as a plain String column (not a Prisma
// enum, see schema.prisma) precisely so this list can grow as new
// modules start sending notifications — extend this array (and, if
// useful, NOTIFICATION_ENTITY_TYPES below) when a future module needs a
// new type, rather than adding a Prisma enum value + migration.
//
// GENERAL/SYSTEM cover anything that doesn't yet have a dedicated type.
// The rest are named ahead of the modules step 32 explicitly keeps this
// service reusable for (Labour, Tractor, Transport, Buyer/Order,
// Payment, KYC) so those steps have a type to reach for immediately
// without touching this file — but nothing below is wired up to actually
// send a notification yet; this is allow-list scaffolding only.
export const NOTIFICATION_TYPES = [
  "GENERAL",
  "SYSTEM",
  "WORK_REQUEST",
  "TRACTOR_BOOKING",
  "TRANSPORT_BOOKING",
  "PRODUCE_OFFER",
  "ORDER",
  "PAYMENT",
  "RATING",
  "KYC_DOCUMENT",
  "VERIFICATION",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Fixed allow-list for the optional relatedEntityType/relatedEntityId
// pair on Notification — identifies which table relatedEntityId points
// into. Same reasoning as NOTIFICATION_TYPES above: a plain validated
// String, extended here as new modules start passing a related entity
// through createNotification()/createBulkNotifications().
export const NOTIFICATION_ENTITY_TYPES = [
  "WORK_REQUEST",
  "TRACTOR_BOOKING",
  "TRANSPORT_BOOKING",
  "PRODUCE_OFFER",
  "ORDER",
  "PAYMENT",
  "RATING",
  "USER_DOCUMENT",
  "FARMER_PROFILE",
  "LABOUR_PROFILE",
  "TRACTOR_PROFILE",
  "TRANSPORT_PROFILE",
] as const;

export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];
