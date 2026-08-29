import { OrderStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import {
  AdvanceOrderInput,
  CancelOrderInput,
  ListOrdersQuery,
} from "../validators/order.validator";

const ORDER_NOT_FOUND_MESSAGE = "Order not found";
const NOT_CANCELLABLE_MESSAGE =
  "Only pending or confirmed orders can be cancelled";
const ALREADY_TERMINAL_MESSAGE =
  "This order has already reached its final status and cannot be advanced further";
const FORBIDDEN_TRANSITION_MESSAGE =
  "You do not have permission to move this order to its next status";

// Shared shape for every response this module sends — enough of each side
// (buyer/farmer) for the other party to know who they're dealing with,
// plus the listing/offer the order came from. Mirrors
// PRODUCE_OFFER_SELECT in produceOffer.service.ts.
const ORDER_SELECT = {
  id: true,
  offerId: true,
  listingId: true,
  buyerId: true,
  farmerId: true,
  crop: true,
  quantity: true,
  unit: true,
  pricePerUnit: true,
  totalAmount: true,
  status: true,
  confirmedAt: true,
  readyAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  completedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      location: true,
      photos: true,
    },
  },
  // BUYER-role users have no profile model in this schema (unlike Farmer/
  // Labour/Tractor/Transport), so fullName + email is all there is to show
  // on the farmer-facing side of an order. Mirrors
  // PRODUCE_OFFER_SELECT.buyer.
  buyer: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  farmer: {
    select: {
      id: true,
      fullName: true,
      farmerProfile: {
        select: {
          mobile: true,
          village: true,
          taluka: true,
          district: true,
          state: true,
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export type OrderResult = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>;

// Shape returned by getOwnOrderHistory — who made each change and what,
// if any, note was attached to it.
const ORDER_HISTORY_SELECT = {
  id: true,
  status: true,
  note: true,
  createdAt: true,
  changedBy: {
    select: {
      id: true,
      fullName: true,
      role: true,
    },
  },
} satisfies Prisma.OrderStatusHistorySelect;

export type OrderHistoryEntry = Prisma.OrderStatusHistoryGetPayload<{
  select: typeof ORDER_HISTORY_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Defines the fixed forward path an order takes, and which role(s) are
// allowed to trigger each step. Cancellation is handled separately
// (cancelOrder) rather than as a "next status" here, since it isn't part
// of the forward path and has its own eligibility window
// (CANCELLABLE_STATUSES below). COMPLETED and CANCELLED have no entry —
// both are terminal, so advanceOrder rejects any attempt to move on from
// them.
const ORDER_TRANSITIONS: Partial<
  Record<OrderStatus, { next: OrderStatus; allowedRoles: Role[] }>
> = {
  [OrderStatus.PENDING]: { next: OrderStatus.CONFIRMED, allowedRoles: [Role.FARMER] },
  [OrderStatus.CONFIRMED]: { next: OrderStatus.READY, allowedRoles: [Role.FARMER] },
  [OrderStatus.READY]: {
    next: OrderStatus.PICKUP,
    allowedRoles: [Role.FARMER, Role.BUYER],
  },
  [OrderStatus.PICKUP]: {
    next: OrderStatus.DELIVERED,
    allowedRoles: [Role.FARMER, Role.BUYER],
  },
  [OrderStatus.DELIVERED]: { next: OrderStatus.COMPLETED, allowedRoles: [Role.BUYER] },
};

// Statuses from which an order can still be cancelled — once produce is
// marked READY (being set aside/prepared for pickup) neither side can
// back out through this action any more; from that point on the only path
// is forward through the remaining statuses.
const CANCELLABLE_STATUSES: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];

// Maps the status an order is *entering* to the single timestamp column
// that records when that happened, so advanceOrder can stamp the right
// field without a long if/else chain. PENDING has no entry since every
// order starts there at creation (createdAt already covers it).
const STATUS_TIMESTAMP_FIELD: Partial<
  Record<OrderStatus, "confirmedAt" | "readyAt" | "pickedUpAt" | "deliveredAt" | "completedAt">
> = {
  [OrderStatus.CONFIRMED]: "confirmedAt",
  [OrderStatus.READY]: "readyAt",
  [OrderStatus.PICKUP]: "pickedUpAt",
  [OrderStatus.DELIVERED]: "deliveredAt",
  [OrderStatus.COMPLETED]: "completedAt",
};

/**
 * Creates an order from a just-accepted produce offer, and writes the
 * initial (PENDING) row of its status history. Called only from
 * produceOffer.service.ts's respondToProduceOffer, inside the same
 * `tx` as the offer's own ACCEPTED update — so an order can never exist
 * without its originating offer being ACCEPTED, and every ACCEPTED offer
 * always gets exactly one (Order.offerId is `@unique`).
 *
 * crop/unit are denormalized from the listing; quantity/pricePerUnit are
 * the agreed terms from the offer itself (not the listing's own
 * price/quantity, which the offer may have negotiated away from) — frozen
 * here so the order's record of what was agreed can't drift if the
 * listing is edited or removed afterward.
 */
export async function createOrderFromAcceptedOffer(
  tx: Prisma.TransactionClient,
  offer: {
    id: string;
    listingId: string;
    buyerId: string;
    farmerId: string;
    offerPrice: number;
    quantity: number;
  },
  createdById: string
): Promise<OrderResult> {
  const listing = await tx.produceListing.findUniqueOrThrow({
    where: { id: offer.listingId },
    select: { crop: true, unit: true },
  });

  const order = await tx.order.create({
    data: {
      offerId: offer.id,
      listingId: offer.listingId,
      buyerId: offer.buyerId,
      farmerId: offer.farmerId,
      crop: listing.crop,
      unit: listing.unit,
      quantity: offer.quantity,
      pricePerUnit: offer.offerPrice,
      totalAmount: offer.offerPrice * offer.quantity,
    },
    select: ORDER_SELECT,
  });

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      status: OrderStatus.PENDING,
      changedById: createdById,
      note: "Order created — offer accepted",
    },
  });

  return order;
}

/**
 * Lists orders the calling buyer has made, most recent first.
 */
export async function listBuyerOrders(
  buyerId: string,
  query: ListOrdersQuery
): Promise<PaginatedResult<OrderResult>> {
  const { status, page, limit } = query;
  const where: Prisma.OrderWhereInput = { buyerId, ...(status ? { status } : {}) };

  return paginateOrders(where, page, limit);
}

/**
 * Lists orders the calling farmer has received, most recent first.
 */
export async function listFarmerOrders(
  farmerId: string,
  query: ListOrdersQuery
): Promise<PaginatedResult<OrderResult>> {
  const { status, page, limit } = query;
  const where: Prisma.OrderWhereInput = { farmerId, ...(status ? { status } : {}) };

  return paginateOrders(where, page, limit);
}

async function paginateOrders(
  where: Prisma.OrderWhereInput,
  page: number,
  limit: number
): Promise<PaginatedResult<OrderResult>> {
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: ORDER_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Fetches a single order the caller is party to, as either the buyer who
 * made it or the farmer who received it. 404s (rather than 403) if it
 * belongs to neither side, so this endpoint can't be used to probe which
 * order ids exist. Mirrors getOwnProduceOfferById.
 */
export async function getOwnOrderById(
  userId: string,
  role: Role,
  id: string
): Promise<OrderResult> {
  const where: Prisma.OrderWhereInput =
    role === Role.BUYER ? { id, buyerId: userId } : { id, farmerId: userId };

  const order = await prisma.order.findFirst({ where, select: ORDER_SELECT });

  if (!order) {
    throw new AppError(ORDER_NOT_FOUND_MESSAGE, 404);
  }

  return order;
}

/**
 * Returns the full status-change audit trail for one of the caller's own
 * orders, oldest first. Reuses getOwnOrderById's visibility check (party
 * to the order, 404 otherwise) before reading history, so this can't be
 * used to probe order ids either.
 */
export async function getOwnOrderHistory(
  userId: string,
  role: Role,
  id: string
): Promise<OrderHistoryEntry[]> {
  await getOwnOrderById(userId, role, id);

  return prisma.orderStatusHistory.findMany({
    where: { orderId: id },
    select: ORDER_HISTORY_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Moves one of the caller's own orders to its next status along the fixed
 * forward path (see ORDER_TRANSITIONS). 404s if the order doesn't belong
 * to the caller, 409 if it has no next status (already COMPLETED or
 * CANCELLED), and 403 if the caller's role isn't allowed to trigger this
 * particular step. Stamps the relevant timestamp column and appends a
 * history row atomically with the status update.
 */
export async function advanceOrder(
  userId: string,
  role: Role,
  id: string,
  input: AdvanceOrderInput
): Promise<OrderResult> {
  const where: Prisma.OrderWhereInput =
    role === Role.BUYER ? { id, buyerId: userId } : { id, farmerId: userId };

  const existing = await prisma.order.findFirst({ where, select: { id: true, status: true } });

  if (!existing) {
    throw new AppError(ORDER_NOT_FOUND_MESSAGE, 404);
  }

  const transition = ORDER_TRANSITIONS[existing.status];

  if (!transition) {
    throw new AppError(ALREADY_TERMINAL_MESSAGE, 409);
  }

  if (!transition.allowedRoles.includes(role)) {
    throw new AppError(FORBIDDEN_TRANSITION_MESSAGE, 403);
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[transition.next];

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: transition.next,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
      select: ORDER_SELECT,
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        status: transition.next,
        changedById: userId,
        note: input.note,
      },
    });

    return updated;
  });
}

/**
 * Cancels one of the caller's own orders (buyer or farmer — either side
 * may cancel). Only valid from PENDING or CONFIRMED — 409 otherwise, since
 * once produce is marked READY for pickup this action is no longer
 * available (mirrors cancelTransportBooking's NOT_CANCELLABLE guard, with
 * a narrower window since orders have more fulfilment steps).
 */
export async function cancelOrder(
  userId: string,
  role: Role,
  id: string,
  input: CancelOrderInput
): Promise<OrderResult> {
  const where: Prisma.OrderWhereInput =
    role === Role.BUYER ? { id, buyerId: userId } : { id, farmerId: userId };

  const existing = await prisma.order.findFirst({ where, select: { id: true, status: true } });

  if (!existing) {
    throw new AppError(ORDER_NOT_FOUND_MESSAGE, 404);
  }

  if (!CANCELLABLE_STATUSES.includes(existing.status)) {
    throw new AppError(NOT_CANCELLABLE_MESSAGE, 409);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        cancelledById: userId,
      },
      select: ORDER_SELECT,
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        status: OrderStatus.CANCELLED,
        changedById: userId,
        note: input.reason,
      },
    });

    return updated;
  });
}
