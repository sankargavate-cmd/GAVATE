import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { Coordinates, findNearby, WithDistanceKm } from "../utils/geo";
import {
  CreateLabourProfileInput,
  SearchLabourQuery,
  SetAvailabilityInput,
  UpdateLabourProfileInput,
} from "../validators/labour.validator";

const PROFILE_ALREADY_EXISTS_MESSAGE = "Labour profile already exists for this account";
const PROFILE_NOT_FOUND_MESSAGE = "Labour profile not found";
const LISTING_NOT_FOUND_MESSAGE = "Labour listing not found or is not currently available";

// Full shape — used for the labour user's own profile (create/get/update).
const LABOUR_PROFILE_SELECT = {
  id: true,
  userId: true,
  profilePhoto: true,
  mobile: true,
  skills: true,
  experienceYears: true,
  state: true,
  district: true,
  taluka: true,
  village: true,
  address: true,
  latitude: true,
  longitude: true,
  dailyWage: true,
  isAvailable: true,
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LabourProfileSelect;

export type LabourProfileResult = Prisma.LabourProfileGetPayload<{
  select: typeof LABOUR_PROFILE_SELECT;
}>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Creates a labour profile for the given user. Fails with 409 if one
 * already exists — this endpoint is create-once; further changes go
 * through updateLabourProfile. isVerified is never accepted from the
 * caller — new profiles always start unverified.
 */
export async function createLabourProfile(
  userId: string,
  input: CreateLabourProfileInput
): Promise<LabourProfileResult> {
  try {
    return await prisma.labourProfile.create({
      data: {
        userId,
        ...input,
      },
      select: LABOUR_PROFILE_SELECT,
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
 * Fetches the calling labour user's own profile. 404 if they haven't
 * created one yet.
 */
export async function getLabourProfile(userId: string): Promise<LabourProfileResult> {
  const profile = await prisma.labourProfile.findUnique({
    where: { userId },
    select: LABOUR_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Partially updates the calling labour user's profile. 404 if no profile
 * exists yet — a labour user must POST once before they can PUT. Silently
 * cannot touch isVerified since that field isn't part of the input type.
 */
export async function updateLabourProfile(
  userId: string,
  input: UpdateLabourProfileInput
): Promise<LabourProfileResult> {
  const existing = await prisma.labourProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.labourProfile.update({
    where: { userId },
    data: input,
    select: LABOUR_PROFILE_SELECT,
  });
}

/**
 * Convenience shortcut for the common single-field update of toggling
 * availability on/off, without requiring the full update payload.
 */
export async function setAvailability(
  userId: string,
  input: SetAvailabilityInput
): Promise<LabourProfileResult> {
  return updateLabourProfile(userId, input);
}

/**
 * Farmer-facing search. Always scoped to isVerified + isAvailable — farmers
 * only ever see labour that is both admin-verified and currently open for
 * work, regardless of what filters they pass in.
 */
export async function searchVerifiedLabour(
  query: SearchLabourQuery
): Promise<PaginatedResult<LabourProfileResult>> {
  const { skills, state, district, minWage, maxWage, page, limit } = query;

  const where: Prisma.LabourProfileWhereInput = {
    isVerified: true,
    isAvailable: true,
    ...(skills && skills.length > 0 ? { skills: { hasSome: skills } } : {}),
    ...(state ? { state: { equals: state, mode: "insensitive" } } : {}),
    ...(district ? { district: { equals: district, mode: "insensitive" } } : {}),
    ...(minWage !== undefined || maxWage !== undefined
      ? {
          dailyWage: {
            ...(minWage !== undefined ? { gte: minWage } : {}),
            ...(maxWage !== undefined ? { lte: maxWage } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.labourProfile.findMany({
      where,
      select: LABOUR_PROFILE_SELECT,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.labourProfile.count({ where }),
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
export async function getVerifiedLabourById(id: string): Promise<LabourProfileResult> {
  const profile = await prisma.labourProfile.findFirst({
    where: { id, isVerified: true, isAvailable: true },
    select: LABOUR_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(LISTING_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Farmer-facing nearby search (Step 31 — Nearby Search). Scoped exactly
 * like searchVerifiedLabour (isVerified + isAvailable) rather than
 * duplicating that rule — the only new behavior here is real-distance
 * filtering/sorting via utils/geo.ts's findNearby on top of the same
 * candidate set. Profiles with no saved coordinates are excluded at the
 * query level (findNearby would also skip them via getCoordinates
 * returning null, but filtering in Prisma avoids pulling rows that can
 * never match). excludeUserId lets the caller keep out their own profile
 * where applicable, mirroring the self-exclusion pattern this app already
 * needs for symmetric two-sided lookups (see produceOffer.service.ts /
 * order.service.ts's role-based `id` filters).
 */
export async function findNearbyVerifiedLabour(
  origin: Coordinates,
  radiusKm: number,
  excludeUserId?: string
): Promise<WithDistanceKm<LabourProfileResult>[]> {
  const profiles = await prisma.labourProfile.findMany({
    where: {
      isVerified: true,
      isAvailable: true,
      latitude: { not: null },
      longitude: { not: null },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: LABOUR_PROFILE_SELECT,
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
