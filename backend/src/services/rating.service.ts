import {
  Order,
  OrderStatus,
  Prisma,
  RatingTargetType,
  TractorBooking,
  TractorBookingStatus,
  TransportBooking,
  TransportBookingStatus,
  WorkRequest,
  WorkRequestStatus,
} from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { notifySafely } from "./notification.service";
import { CreateRatingInput, ListRatingsQuery, UpdateRatingInput } from "../validators/rating.validator";

const ENGAGEMENT_NOT_FOUND_MESSAGE =
  "Booking or order not found, or does not belong to you";
const NOT_COMPLETED_MESSAGE =
  "Only a completed booking or order can be rated";
const ALREADY_RATED_MESSAGE = "This booking or order has already been rated";
const RATING_NOT_FOUND_MESSAGE = "Rating not found";
// Step 43 — structurally unreachable today (a WorkRequest/TractorBooking/
// TransportBooking/Order's two sides always belong to two different
// User rows with two different roles — see e.g. createWorkRequest's
// Role.LABOUR check in workRequest.service.ts — so farmerId can never
// equal the other party's id). Guarded explicitly anyway as a
// defense-in-depth invariant on the Rating write path itself, rather
// than relying solely on every calling module's own role checks staying
// correct forever.
const SELF_RATING_MESSAGE = "You cannot rate yourself";

// Builds the single-field filter/data shape matching Rating's four
// nullable reference FKs for a given targetType — used for both the
// duplicate-check lookup and the create payload, so the two always agree
// on which FK is in play. Kept as an explicit switch (rather than a
// computed [key]: value against a dynamically-picked field name) so the
// result stays a concrete literal shape Prisma's generated input types
// can check directly, mirroring how every other service in this codebase
// builds typed where/data objects instead of dynamic ones.
function referenceFieldFilter(
  targetType: RatingTargetType,
  referenceId: string
):
  | { workRequestId: string }
  | { tractorBookingId: string }
  | { transportBookingId: string }
  | { orderId: string } {
  switch (targetType) {
    case RatingTargetType.LABOUR:
      return { workRequestId: referenceId };
    case RatingTargetType.TRACTOR:
      return { tractorBookingId: referenceId };
    case RatingTargetType.TRANSPORT:
      return { transportBookingId: referenceId };
    case RatingTargetType.BUYER:
      return { orderId: referenceId };
  }
}

// Shared response shape — enough of both sides for the other party to
// know who they're dealing with, mirrors *_SELECT constants in the
// booking services (e.g. TRANSPORT_BOOKING_SELECT).
const RATING_SELECT = {
  id: true,
  raterId: true,
  rateeId: true,
  targetType: true,
  workRequestId: true,
  tractorBookingId: true,
  transportBookingId: true,
  orderId: true,
  rating: true,
  review: true,
  createdAt: true,
  updatedAt: true,
  rater: { select: { id: true, fullName: true } },
  ratee: { select: { id: true, fullName: true, role: true } },
} satisfies Prisma.RatingSelect;

export type RatingResult = Prisma.RatingGetPayload<{ select: typeof RATING_SELECT }>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RatingSummary {
  averageRating: number | null;
  ratingCount: number;
}

/**
 * Resolves the underlying engagement (WorkRequest / TractorBooking /
 * TransportBooking / Order) a create-rating call points at, verifying in
 * one place that it: exists, belongs to the calling farmer, and has
 * reached a state this app treats as "completed" for rating purposes.
 * Returns the ratee's userId (who the rating is actually about) alongside
 * the resolved row.
 *
 * WorkRequest/TractorBooking/TransportBooking have no explicit COMPLETED
 * status in this app's lifecycle (their terminal positive state is
 * ACCEPTED) — so "completed" for those three is approximated as
 * status ACCEPTED *and* the scheduled work/booking date has passed, which
 * is the closest available signal that the engagement actually happened
 * rather than just being agreed to. Order does carry an explicit
 * COMPLETED status (Step 23), so that one is checked directly.
 */
async function resolveRateableEngagement(
  farmerId: string,
  targetType: RatingTargetType,
  referenceId: string
): Promise<{ rateeId: string }> {
  const now = new Date();

  if (targetType === RatingTargetType.LABOUR) {
    const workRequest: Pick<WorkRequest, "id" | "farmerId" | "labourId" | "status" | "workDate"> | null =
      await prisma.workRequest.findFirst({
        where: { id: referenceId, farmerId },
        select: { id: true, farmerId: true, labourId: true, status: true, workDate: true },
      });

    if (!workRequest) {
      throw new AppError(ENGAGEMENT_NOT_FOUND_MESSAGE, 404);
    }
    if (workRequest.status !== WorkRequestStatus.ACCEPTED || workRequest.workDate > now) {
      throw new AppError(NOT_COMPLETED_MESSAGE, 409);
    }
    return { rateeId: workRequest.labourId };
  }

  if (targetType === RatingTargetType.TRACTOR) {
    const tractorBooking: Pick<
      TractorBooking,
      "id" | "farmerId" | "tractorOwnerId" | "status" | "bookingDate"
    > | null = await prisma.tractorBooking.findFirst({
      where: { id: referenceId, farmerId },
      select: { id: true, farmerId: true, tractorOwnerId: true, status: true, bookingDate: true },
    });

    if (!tractorBooking) {
      throw new AppError(ENGAGEMENT_NOT_FOUND_MESSAGE, 404);
    }
    if (tractorBooking.status !== TractorBookingStatus.ACCEPTED || tractorBooking.bookingDate > now) {
      throw new AppError(NOT_COMPLETED_MESSAGE, 409);
    }
    return { rateeId: tractorBooking.tractorOwnerId };
  }

  if (targetType === RatingTargetType.TRANSPORT) {
    const transportBooking: Pick<
      TransportBooking,
      "id" | "farmerId" | "transportProviderId" | "status" | "bookingDate"
    > | null = await prisma.transportBooking.findFirst({
      where: { id: referenceId, farmerId },
      select: { id: true, farmerId: true, transportProviderId: true, status: true, bookingDate: true },
    });

    if (!transportBooking) {
      throw new AppError(ENGAGEMENT_NOT_FOUND_MESSAGE, 404);
    }
    if (
      transportBooking.status !== TransportBookingStatus.ACCEPTED ||
      transportBooking.bookingDate > now
    ) {
      throw new AppError(NOT_COMPLETED_MESSAGE, 409);
    }
    return { rateeId: transportBooking.transportProviderId };
  }

  // targetType === BUYER
  const order: Pick<Order, "id" | "farmerId" | "buyerId" | "status"> | null =
    await prisma.order.findFirst({
      where: { id: referenceId, farmerId },
      select: { id: true, farmerId: true, buyerId: true, status: true },
    });

  if (!order) {
    throw new AppError(ENGAGEMENT_NOT_FOUND_MESSAGE, 404);
  }
  if (order.status !== OrderStatus.COMPLETED) {
    throw new AppError(NOT_COMPLETED_MESSAGE, 409);
  }
  return { rateeId: order.buyerId };
}

/**
 * Creates a rating from the calling farmer against a completed engagement.
 * Self-rating is rejected outright (see SELF_RATING_MESSAGE) — structurally
 * unreachable via any current calling path, but guarded explicitly here.
 * Duplicate prevention is two-layered: an upfront existence check (for a
 * clean error message) backed by each reference FK's @unique DB
 * constraint (to close the race-condition window between the check and
 * the insert). After creating, recomputes the ratee's cached average.
 */
export async function createRating(
  farmerId: string,
  input: CreateRatingInput
): Promise<RatingResult> {
  const { targetType, referenceId, rating, review } = input;
  const { rateeId } = await resolveRateableEngagement(farmerId, targetType, referenceId);

  // Step 43 — see SELF_RATING_MESSAGE's doc comment: unreachable via any
  // current calling path, guarded explicitly anyway.
  if (rateeId === farmerId) {
    throw new AppError(SELF_RATING_MESSAGE, 403);
  }

  const referenceFilter = referenceFieldFilter(targetType, referenceId);

  const existing = await prisma.rating.findFirst({
    where: referenceFilter,
    select: { id: true },
  });
  if (existing) {
    throw new AppError(ALREADY_RATED_MESSAGE, 409);
  }

  try {
    const created = await prisma.rating.create({
      data: {
        raterId: farmerId,
        rateeId,
        targetType,
        rating,
        review,
        ...referenceFilter,
      },
      select: RATING_SELECT,
    });

    await recomputeAverageRating(rateeId, targetType);

    // Notify the ratee they received a new rating. Never exposes the
    // review text — just enough to send the recipient to the rating
    // itself.
    await notifySafely({
      recipientId: created.rateeId,
      type: "RATING",
      title: "New Rating Received",
      message: `${created.rater.fullName} left you a ${created.rating}-star rating.`,
      relatedEntityType: "RATING",
      relatedEntityId: created.id,
    });

    return created;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(ALREADY_RATED_MESSAGE, 409);
    }
    throw err;
  }
}

/**
 * Updates the rating value and/or review text on one of the calling
 * farmer's own ratings. Which engagement it was left against is
 * immutable — only `rating`/`review` from UpdateRatingInput are ever
 * written.
 */
export async function updateRating(
  farmerId: string,
  id: string,
  input: UpdateRatingInput
): Promise<RatingResult> {
  const existing = await prisma.rating.findFirst({
    where: { id, raterId: farmerId },
    select: { id: true, rateeId: true, targetType: true },
  });

  if (!existing) {
    throw new AppError(RATING_NOT_FOUND_MESSAGE, 404);
  }

  const updated = await prisma.rating.update({
    where: { id },
    data: {
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.review !== undefined ? { review: input.review } : {}),
    },
    select: RATING_SELECT,
  });

  if (input.rating !== undefined) {
    await recomputeAverageRating(existing.rateeId, existing.targetType);
  }

  return updated;
}

/**
 * Deletes one of the calling farmer's own ratings, then recomputes the
 * ratee's cached average so a removed rating doesn't linger in it.
 */
export async function deleteRating(farmerId: string, id: string): Promise<void> {
  const existing = await prisma.rating.findFirst({
    where: { id, raterId: farmerId },
    select: { id: true, rateeId: true, targetType: true },
  });

  if (!existing) {
    throw new AppError(RATING_NOT_FOUND_MESSAGE, 404);
  }

  await prisma.rating.delete({ where: { id } });
  await recomputeAverageRating(existing.rateeId, existing.targetType);
}

/**
 * Fetches a single rating the caller is party to, as either the farmer
 * who left it or the user it was left about. 404s (rather than 403) if
 * the caller is neither, so this endpoint can't be used to probe which
 * rating ids exist.
 */
export async function getOwnRatingById(userId: string, id: string): Promise<RatingResult> {
  const rating = await prisma.rating.findFirst({
    where: { id, OR: [{ raterId: userId }, { rateeId: userId }] },
    select: RATING_SELECT,
  });

  if (!rating) {
    throw new AppError(RATING_NOT_FOUND_MESSAGE, 404);
  }

  return rating;
}

/**
 * Lists ratings the calling farmer has given, most recent first.
 */
export async function listGivenRatings(
  farmerId: string,
  query: ListRatingsQuery
): Promise<PaginatedResult<RatingResult>> {
  const { targetType, page, limit } = query;
  const where: Prisma.RatingWhereInput = {
    raterId: farmerId,
    ...(targetType ? { targetType } : {}),
  };

  return paginateRatings(where, page, limit);
}

/**
 * Lists ratings the calling user has received, most recent first. Valid
 * for any ratee role (Labour, Tractor Owner, Transport Provider, Buyer) —
 * targetType is not forced here since a caller's own userId already scopes
 * the query to ratings actually about them.
 */
export async function listReceivedRatings(
  rateeId: string,
  query: ListRatingsQuery
): Promise<PaginatedResult<RatingResult>> {
  const { targetType, page, limit } = query;
  const where: Prisma.RatingWhereInput = {
    rateeId,
    ...(targetType ? { targetType } : {}),
  };

  return paginateRatings(where, page, limit);
}

/**
 * Public (any authenticated user) summary + review list for a specific
 * ratee — the data a farmer would see on a Labour/Tractor/Transport
 * detail page, or a buyer's own reputation view. Always computed live via
 * aggregate rather than read from a cached profile field, so it's correct
 * regardless of which role (or lack of a profile table, in Buyer's case)
 * the target user has.
 */
export async function getUserRatingSummary(
  rateeId: string,
  query: ListRatingsQuery
): Promise<PaginatedResult<RatingResult> & RatingSummary> {
  const { targetType, page, limit } = query;
  const where: Prisma.RatingWhereInput = {
    rateeId,
    ...(targetType ? { targetType } : {}),
  };

  const [paginated, summary] = await Promise.all([
    paginateRatings(where, page, limit),
    prisma.rating.aggregate({ where, _avg: { rating: true }, _count: { rating: true } }),
  ]);

  return {
    ...paginated,
    averageRating: summary._avg.rating,
    ratingCount: summary._count.rating,
  };
}

async function paginateRatings(
  where: Prisma.RatingWhereInput,
  page: number,
  limit: number
): Promise<PaginatedResult<RatingResult>> {
  const [items, total] = await prisma.$transaction([
    prisma.rating.findMany({
      where,
      select: RATING_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rating.count({ where }),
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
 * Recomputes and persists the cached averageRating/ratingCount for a
 * ratee, called after every create/update(rating value)/delete. Only
 * LABOUR/TRACTOR/TRANSPORT ratees have a profile table to cache onto
 * (LabourProfile/TractorProfile/TransportProfile) — BUYER has no profile
 * model in this app (Role.BUYER users are plain Users), so buyer averages
 * are always computed on demand by getUserRatingSummary instead of cached.
 * averageRating is left null (not 0) when ratingCount is 0, so "no ratings
 * yet" stays distinguishable from "rated 0" on the profile record.
 */
async function recomputeAverageRating(
  rateeId: string,
  targetType: RatingTargetType
): Promise<void> {
  if (targetType === RatingTargetType.BUYER) {
    return;
  }

  const { _avg, _count } = await prisma.rating.aggregate({
    where: { rateeId, targetType },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const data = { averageRating: _avg.rating, ratingCount: _count.rating };

  if (targetType === RatingTargetType.LABOUR) {
    await prisma.labourProfile.updateMany({ where: { userId: rateeId }, data });
  } else if (targetType === RatingTargetType.TRACTOR) {
    await prisma.tractorProfile.updateMany({ where: { userId: rateeId }, data });
  } else if (targetType === RatingTargetType.TRANSPORT) {
    await prisma.transportProfile.updateMany({ where: { userId: rateeId }, data });
  }
}
