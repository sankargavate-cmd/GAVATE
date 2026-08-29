import { z } from "zod";

// Fixed set of selectable radii for nearby search (Step 31) — mirrors
// labour.validator.ts/tractor.validator.ts/transport.validator.ts's
// NEARBY_RADIUS_KM_OPTIONS exactly; kept as its own copy here rather than
// a shared import, same reasoning as this codebase's other small
// cross-validator duplications (see location.validator.ts's
// latitudeField/longitudeField comment).
const NEARBY_RADIUS_KM_OPTIONS = [5, 10, 25, 50] as const;

// Query params arrive as strings, so latitude/longitude/radiusKm are all
// coerced. latitude/longitude are required — nearby search is always
// relative to a caller-supplied point — while radiusKm is optional and
// defaults to 5, per the Step 31 requirement.
export const nearbyBuyerQuerySchema = z.object({
  latitude: z.coerce
    .number({ required_error: "latitude is required", invalid_type_error: "latitude must be a number" })
    .min(-90, "latitude must be between -90 and 90")
    .max(90, "latitude must be between -90 and 90"),
  longitude: z.coerce
    .number({ required_error: "longitude is required", invalid_type_error: "longitude must be a number" })
    .min(-180, "longitude must be between -180 and 180")
    .max(180, "longitude must be between -180 and 180"),
  radiusKm: z.coerce
    .number({ invalid_type_error: "radiusKm must be a number" })
    .refine((value) => (NEARBY_RADIUS_KM_OPTIONS as readonly number[]).includes(value), {
      message: `radiusKm must be one of: ${NEARBY_RADIUS_KM_OPTIONS.join(", ")}`,
    })
    .optional()
    .default(5),
});

export type NearbyBuyerQuery = z.infer<typeof nearbyBuyerQuerySchema>;
