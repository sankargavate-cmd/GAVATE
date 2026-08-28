// Reusable latitude/longitude distance + nearby-search helpers (Step
// 30 — Location Engine foundation). Pure, self-contained utility
// functions with no Prisma/Express dependency of their own, so they can
// be imported by any future service (Labour/Tractor/Transport/Buyer
// radius search, etc.) without pulling in this module's own concerns.
// Building the actual radius-search APIs for those roles is explicitly
// out of scope for this step — this file only provides the math they
// will eventually share.

const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in kilometers, using
 * the haversine formula. Accurate enough for farm-to-provider distances
 * at this app's scale (treats Earth as a sphere, not an ellipsoid) —
 * the small additional accuracy of a more exact model isn't worth the
 * complexity for this use case.
 */
export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export interface WithDistanceKm<T> {
  item: T;
  distanceKm: number;
}

/**
 * Generic nearby-search helper: given an origin point and a list of
 * arbitrary items, computes each item's distance from the origin (via
 * `getCoordinates`) and returns them sorted nearest-first. Items whose
 * `getCoordinates` returns null (e.g. a provider who hasn't saved a
 * location yet) are silently excluded rather than throwing, since a
 * mixed dataset of "located" and "not-yet-located" records is the normal
 * case here.
 *
 * `radiusKm`, if provided, additionally filters out anything farther than
 * that — omit it to just get every item ranked by distance. Deliberately
 * generic over T (rather than tied to Labour/Tractor/Transport/Buyer)
 * so any future per-role search service can reuse this one function
 * instead of reimplementing the same sort/filter logic.
 */
export function findNearby<T>(
  origin: Coordinates,
  items: readonly T[],
  getCoordinates: (item: T) => Coordinates | null,
  radiusKm?: number
): WithDistanceKm<T>[] {
  const withDistance: WithDistanceKm<T>[] = [];

  for (const item of items) {
    const coordinates = getCoordinates(item);
    if (!coordinates) {
      continue;
    }

    const distanceKm = calculateDistanceKm(origin, coordinates);
    if (radiusKm === undefined || distanceKm <= radiusKm) {
      withDistance.push({ item, distanceKm });
    }
  }

  return withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
}
