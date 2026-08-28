import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { Coordinates, findNearby, WithDistanceKm } from "../utils/geo";
import {
  CreateTractorProfileInput,
  SearchTractorQuery,
  SetTractorAvailabilityInput,
  UpdateTractorProfileInput,
} from "../validators/tractor.validator";

const PROFILE_ALREADY_EXISTS_MESSAGE = "Tractor profile already exists for this account";
const PROFILE_NOT_FOUND_MESSAGE = "Tractor profile not found";
const LISTING_NOT_FOUND_MESSAGE = "Tractor listing not found or is not currently available";

// Full shape — used for the tractor owner's own profile (create/get/update).
const TRACTOR_PROFILE_SELECT = {
  id: true,
  userId: true,
  photos: true,
  mobile: true,
  tractorType: true,
  model: true,
  state: true,
  district: true,
  taluka: true,
  village: true,
  address: true,
  latitude: true,
  longitude: true,
  ratePerHour: true,
  ratePerDay: true,
  isAvailable: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TractorProfileSelect;

export type TractorProfileResult = Prisma.TractorProfileGetPayload<{
  select: typeof TRACTOR_PROFILE_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a tractor profile for the given user. Fails with 409 if one
 * already exists — this endpoint is create-once; further changes go
 * through updateTractorProfile. isVerified is never accepted from the
 * caller — new profiles always start unverified.
 */
export async function createTractorProfile(
  userId: string,
  input: CreateTractorProfileInput
): Promise<TractorProfileResult> {
  try {
    return await prisma.tractorProfile.create({
      data: {
        userId,
        ...input,
      },
      select: TRACTOR_PROFILE_SELECT,
    });
  } catch (err) {
    // Race-condition fallback: two concurrent creates for the same user can
    // both pass application-level checks before either commits.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(PROFILE_ALREADY_EXISTS_MESSAGE, 409);
    }
    throw err;
  }
}

/**
 * Fetches the calling tractor owner's own profile. 404 if they haven't
 * created one yet.
 */
export async function getTractorProfile(userId: string): Promise<TractorProfileResult> {
  const profile = await prisma.tractorProfile.findUnique({
    where: { userId },
    select: TRACTOR_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Partially updates the calling tractor owner's profile. 404 if no profile
 * exists yet — a tractor owner must POST once before they can PUT.
 * Silently cannot touch isVerified since that field isn't part of the
 * input type.
 */
export async function updateTractorProfile(
  userId: string,
  input: UpdateTractorProfileInput
): Promise<TractorProfileResult> {
  const existing = await prisma.tractorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.tractorProfile.update({
    where: { userId },
    data: input,
    select: TRACTOR_PROFILE_SELECT,
  });
}

/**
 * Convenience shortcut for the common single-field update of toggling
 * availability on/off, without requiring the full update payload.
 */
export async function setTractorAvailability(
  userId: string,
  input: SetTractorAvailabilityInput
): Promise<TractorProfileResult> {
  return updateTractorProfile(userId, input);
}

/**
 * Farmer-facing search. Always scoped to isVerified + isAvailable — farmers
 * only ever see tractors that are both admin-verified and currently open
 * for hire, regardless of what filters they pass in.
 *
 * rateType narrows which rate field minRate/maxRate compares against; when
 * omitted, a tractor matches if either of its rates falls in range (an
 * owner may only have one of the two rates set).
 */
export async function searchVerifiedTractors(
  query: SearchTractorQuery
): Promise<PaginatedResult<TractorProfileResult>> {
  const { tractorType, state, district, rateType, minRate, maxRate, page, limit } = query;

  const hasRateFilter = minRate !== undefined || maxRate !== undefined;
  const rateRange = {
    ...(minRate !== undefined ? { gte: minRate } : {}),
    ...(maxRate !== undefined ? { lte: maxRate } : {}),
  };

  let rateWhere: Prisma.TractorProfileWhereInput = {};
  if (hasRateFilter) {
    if (rateType === "HOURLY") {
      rateWhere = { ratePerHour: rateRange };
    } else if (rateType === "DAILY") {
      rateWhere = { ratePerDay: rateRange };
    } else {
      // No rateType specified — match either rate field being in range.
      rateWhere = {
        OR: [{ ratePerHour: rateRange }, { ratePerDay: rateRange }],
      };
    }
  }

  const where: Prisma.TractorProfileWhereInput = {
    isVerified: true,
    isAvailable: true,
    ...(tractorType ? { tractorType: { equals: tractorType, mode: "insensitive" } } : {}),
    ...(state ? { state: { equals: state, mode: "insensitive" } } : {}),
    ...(district ? { district: { equals: district, mode: "insensitive" } } : {}),
    ...rateWhere,
  };

  const [items, total] = await prisma.$transaction([
    prisma.tractorProfile.findMany({
      where,
      select: TRACTOR_PROFILE_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tractorProfile.count({ where }),
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
 * Farmer-facing single-listing view. Scoped the same way as search — a
 * verified-but-currently-unavailable (or unverified) profile 404s here too,
 * so this endpoint can't be used to peek at listings the search endpoint
 * would otherwise hide.
 */
export async function getVerifiedTractorById(id: string): Promise<TractorProfileResult> {
  const profile = await prisma.tractorProfile.findFirst({
    where: { id, isVerified: true, isAvailable: true },
    select: TRACTOR_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Farmer-facing availability check for a specific tractor listing. Reuses
 * the same visibility rule as getVerifiedTractorById/search (verified +
 * currently available) so this can't be used to probe hidden listings —
 * it 404s exactly where the detail endpoint would.
 */
export async function getTractorAvailability(
  id: string
): Promise<{ id: string; isAvailable: boolean }> {
  const profile = await prisma.tractorProfile.findFirst({
    where: { id, isVerified: true },
    select: { id: true, isAvailable: true },
  });

  if (!profile) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Farmer-facing nearby search (Step 31 — Nearby Search). Scoped exactly
 * like searchVerifiedTractors (isVerified + isAvailable) rather than
 * duplicating that rule — the only new behavior here is real-distance
 * filtering/sorting via utils/geo.ts's findNearby on top of the same
 * candidate set. Profiles with no saved coordinates are excluded at the
 * query level. excludeUserId lets the caller keep out their own profile
 * where applicable, mirroring findNearbyVerifiedLabour in
 * labour.service.ts.
 */
export async function findNearbyVerifiedTractors(
  origin: Coordinates,
  radiusKm: number,
  excludeUserId?: string
): Promise<WithDistanceKm<TractorProfileResult>[]> {
  const profiles = await prisma.tractorProfile.findMany({
    where: {
      isVerified: true,
      isAvailable: true,
      latitude: { not: null },
      longitude: { not: null },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: TRACTOR_PROFILE_SELECT,
  });

  return findNearby(
    origin,
    profiles,
    (profile) =>
      profile.latitude !== null && profile.longitude !== null
        ? { latitude: profile.latitude, longitude: profile.longitude }
        : null,
    radiusKm
  );
}
