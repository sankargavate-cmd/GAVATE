import { Prisma, Role } from "@prisma/client";
import { prisma } from "../config/database";
import { Coordinates, findNearby, WithDistanceKm } from "../utils/geo";
import { getVerifiedBuyerUserIds } from "./buyerVerification.service";

// BUYER-role users have no profile table of their own (unlike Labour/
// Tractor/Transport) — their location lives on the User model itself
// (Step 30's location.service.ts) and their verification status is
// computed live from UserDocument rows (buyerVerification.service.ts).
// This explicit allow-list mirrors USER_LOCATION_SELECT in
// location.service.ts and SAFE_USER_SELECT in auth.service.ts: a farmer
// browsing nearby buyers gets only what's needed to identify/locate one,
// never email, passwordHash, or any other account field.
const NEARBY_BUYER_SELECT = {
  id: true,
  fullName: true,
  state: true,
  district: true,
  taluka: true,
  village: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type NearbyBuyerCandidate = Prisma.UserGetPayload<{ select: typeof NEARBY_BUYER_SELECT }>;

export type NearbyBuyerResult = NearbyBuyerCandidate & { isVerified: true };

/**
 * Farmer-facing nearby search for verified buyers (Step 31 — Nearby
 * Search). Unlike findNearbyVerifiedLabour/Tractors/TransportProviders in
 * their respective services (which each query their own profile table),
 * this queries the User table directly — scoped to role=BUYER +
 * isActive, since that's the only place a buyer's identity/location
 * lives. It then layers the same "every required KYC document APPROVED"
 * rule that already gates buyer marketplace actions elsewhere (see
 * assertBuyerVerified in buyerVerification.service.ts) via
 * getVerifiedBuyerUserIds — computed in a single batched query rather
 * than one per candidate — before finally handing the surviving,
 * located, verified candidates to utils/geo.ts's findNearby for
 * distance filtering/sorting, exactly like the other three roles.
 * excludeUserId lets the caller keep out their own account where
 * applicable, mirroring findNearbyVerifiedLabour.
 */
export async function findNearbyVerifiedBuyers(
  origin: Coordinates,
  radiusKm: number,
  excludeUserId?: string
): Promise<WithDistanceKm<NearbyBuyerResult>[]> {
  const candidates = await prisma.user.findMany({
    where: {
      role: Role.BUYER,
      isActive: true,
      latitude: { not: null },
      longitude: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: NEARBY_BUYER_SELECT,
  });

  if (candidates.length === 0) {
    return [];
  }

  const verifiedIds = await getVerifiedBuyerUserIds(candidates.map((candidate) => candidate.id));

  const verifiedCandidates: NearbyBuyerResult[] = candidates
    .filter((candidate) => verifiedIds.has(candidate.id))
    .map((candidate) => ({ ...candidate, isVerified: true as const }));

  return findNearby(
    origin,
    verifiedCandidates,
    (candidate) =>
      candidate.latitude !== null && candidate.longitude !== null
        ? { latitude: candidate.latitude, longitude: candidate.longitude }
        : null,
    radiusKm
  );
}
