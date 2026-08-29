import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { Coordinates, findNearby, WithDistanceKm } from "../utils/geo";
import {
  CreateTransportProfileInput,
  SearchTransportQuery,
  SetTransportAvailabilityInput,
  UpdateTransportProfileInput,
} from "../validators/transport.validator";

const PROFILE_ALREADY_EXISTS_MESSAGE = "Transport profile already exists for this account";
const PROFILE_NOT_FOUND_MESSAGE = "Transport profile not found";
const LISTING_NOT_FOUND_MESSAGE = "Transport listing not found or is not currently available";

// Full shape — used for the transport provider's own profile (create/get/update).
const TRANSPORT_PROFILE_SELECT = {
  id: true,
  userId: true,
  photos: true,
  mobile: true,
  vehicleType: true,
  vehicleNumber: true,
  capacity: true,
  capacityUnit: true,
  state: true,
  district: true,
  taluka: true,
  village: true,
  address: true,
  latitude: true,
  longitude: true,
  ratePerKm: true,
  ratePerTrip: true,
  isAvailable: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TransportProfileSelect;

export type TransportProfileResult = Prisma.TransportProfileGetPayload<{
  select: typeof TRANSPORT_PROFILE_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a transport profile for the given user. Fails with 409 if one
 * already exists — this endpoint is create-once; further changes go
 * through updateTransportProfile. isVerified is never accepted from the
 * caller — new profiles always start unverified.
 */
export async function createTransportProfile(
  userId: string,
  input: CreateTransportProfileInput
): Promise<TransportProfileResult> {
  try {
    return await prisma.transportProfile.create({
      data: {
        userId,
        ...input,
      },
      select: TRANSPORT_PROFILE_SELECT,
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
 * Fetches the calling transport provider's own profile. 404 if they
 * haven't created one yet.
 */
export async function getTransportProfile(userId: string): Promise<TransportProfileResult> {
  const profile = await prisma.transportProfile.findUnique({
    where: { userId },
    select: TRANSPORT_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Partially updates the calling transport provider's profile. 404 if no
 * profile exists yet — a transport provider must POST once before they can
 * PUT. Silently cannot touch isVerified since that field isn't part of the
 * input type.
 */
export async function updateTransportProfile(
  userId: string,
  input: UpdateTransportProfileInput
): Promise<TransportProfileResult> {
  const existing = await prisma.transportProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.transportProfile.update({
    where: { userId },
    data: input,
    select: TRANSPORT_PROFILE_SELECT,
  });
}

/**
 * Convenience shortcut for the common single-field update of toggling
 * availability on/off, without requiring the full update payload.
 */
export async function setTransportAvailability(
  userId: string,
  input: SetTransportAvailabilityInput
): Promise<TransportProfileResult> {
  return updateTransportProfile(userId, input);
}

/**
 * Farmer-facing search. Always scoped to isVerified + isAvailable —
 * farmers only ever see transport providers who are both admin-verified
 * and currently open for hire, regardless of what filters they pass in.
 *
 * rateType narrows which rate field minRate/maxRate compares against; when
 * omitted, a provider matches if either of its rates falls in range (a
 * provider may only have one of the two rates set).
 */
export async function searchVerifiedTransportProviders(
  query: SearchTransportQuery
): Promise<PaginatedResult<TransportProfileResult>> {
  const {
    vehicleType,
    state,
    district,
    capacityUnit,
    minCapacity,
    maxCapacity,
    rateType,
    minRate,
    maxRate,
    page,
    limit,
  } = query;

  const hasRateFilter = minRate !== undefined || maxRate !== undefined;
  const rateRange = {
    ...(minRate !== undefined ? { gte: minRate } : {}),
    ...(maxRate !== undefined ? { lte: maxRate } : {}),
  };

  let rateWhere: Prisma.TransportProfileWhereInput = {};
  if (hasRateFilter) {
    if (rateType === "PER_KM") {
      rateWhere = { ratePerKm: rateRange };
    } else if (rateType === "PER_TRIP") {
      rateWhere = { ratePerTrip: rateRange };
    } else {
      // No rateType specified — match either rate field being in range.
      rateWhere = {
        OR: [{ ratePerKm: rateRange }, { ratePerTrip: rateRange }],
      };
    }
  }

  const hasCapacityFilter = minCapacity !== undefined || maxCapacity !== undefined;
  const capacityWhere: Prisma.TransportProfileWhereInput = hasCapacityFilter
    ? {
        capacity: {
          ...(minCapacity !== undefined ? { gte: minCapacity } : {}),
          ...(maxCapacity !== undefined ? { lte: maxCapacity } : {}),
        },
      }
    : {};

  const where: Prisma.TransportProfileWhereInput = {
    isVerified: true,
    isAvailable: true,
    ...(vehicleType ? { vehicleType: { equals: vehicleType, mode: "insensitive" } } : {}),
    ...(state ? { state: { equals: state, mode: "insensitive" } } : {}),
    ...(district ? { district: { equals: district, mode: "insensitive" } } : {}),
    ...(capacityUnit ? { capacityUnit } : {}),
    ...capacityWhere,
    ...rateWhere,
  };

  const [items, total] = await prisma.$transaction([
    prisma.transportProfile.findMany({
      where,
      select: TRANSPORT_PROFILE_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.transportProfile.count({ where }),
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
export async function getVerifiedTransportById(id: string): Promise<TransportProfileResult> {
  const profile = await prisma.transportProfile.findFirst({
    where: { id, isVerified: true, isAvailable: true },
    select: TRANSPORT_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Farmer-facing availability check for a specific transport listing.
 * Reuses the same visibility rule as getVerifiedTransportById/search
 * (verified + currently available) so this can't be used to probe hidden
 * listings — it 404s exactly where the detail endpoint would.
 */
export async function getTransportAvailability(
  id: string
): Promise<{ id: string; isAvailable: boolean }> {
  const profile = await prisma.transportProfile.findFirst({
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
 * like searchVerifiedTransportProviders (isVerified + isAvailable) rather
 * than duplicating that rule — the only new behavior here is real-distance
 * filtering/sorting via utils/geo.ts's findNearby on top of the same
 * candidate set. Profiles with no saved coordinates are excluded at the
 * query level. excludeUserId lets the caller keep out their own profile
 * where applicable, mirroring findNearbyVerifiedLabour in
 * labour.service.ts.
 */
export async function findNearbyVerifiedTransportProviders(
  origin: Coordinates,
  radiusKm: number,
  excludeUserId?: string
): Promise<WithDistanceKm<TransportProfileResult>[]> {
  const profiles = await prisma.transportProfile.findMany({
    where: {
      isVerified: true,
      isAvailable: true,
      latitude: { not: null },
      longitude: { not: null },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: TRANSPORT_PROFILE_SELECT,
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
