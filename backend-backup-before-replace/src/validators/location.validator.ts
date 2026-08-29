import { z } from "zod";

// Place-name fields (state/district/taluka/village) mirror
// farmer.validator.ts's shortTextField exactly in shape, but are
// optional here — unlike a farmer profile's required address fields, a
// User's location (Step 30) may be set partially or not at all so
// existing users are never broken by this feature.
const placeNameField = (label: string, max = 100) =>
  z
    .string()
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(max, `${label} must be at most ${max} characters`)
    .optional();

// Identical bounds to farmer.validator.ts's latitudeField/longitudeField
// (-90..90 / -180..180) — kept as its own copy here rather than a shared
// import since the two validator modules have no other coupling and
// duplicating a two-line rule is cheaper than introducing one.
const latitudeField = z
  .number({ invalid_type_error: "latitude must be a number" })
  .min(-90, "latitude must be between -90 and 90")
  .max(90, "latitude must be between -90 and 90")
  .optional();

const longitudeField = z
  .number({ invalid_type_error: "longitude must be a number" })
  .min(-180, "longitude must be between -180 and 180")
  .max(180, "longitude must be between -180 and 180")
  .optional();

// Every field optional, mirrors updateFarmerProfileSchema — a PUT here is
// a partial update, not a full replace, and at least one field must be
// supplied (enforced by the .refine below) so an empty body can't be
// mistaken for "clear my location".
export const updateLocationSchema = z
  .object({
    state: placeNameField("state"),
    district: placeNameField("district"),
    taluka: placeNameField("taluka"),
    village: placeNameField("village"),
    latitude: latitudeField,
    longitude: longitudeField,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one location field must be provided",
  });

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
