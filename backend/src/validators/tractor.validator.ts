import { z } from "zod";

// Indian 10-digit mobile numbers, optionally prefixed with +91 / 91 / 0.
// Stored normalized to the plain 10-digit form. Mirrors labour.validator.ts.
const MOBILE_REGEX = /^(?:\+91|91|0)?([6-9]\d{9})$/;

const mobileField = z
  .string({ required_error: "mobile is required" })
  .trim()
  .regex(MOBILE_REGEX, "mobile must be a valid 10-digit Indian mobile number")
  .transform((value) => value.replace(MOBILE_REGEX, "$1"));

const shortTextField = (label: string, max = 100) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(max, `${label} must be at most ${max} characters`);

const addressField = z
  .string({ required_error: "address is required" })
  .trim()
  .min(5, "address must be at least 5 characters")
  .max(500, "address must be at most 500 characters");

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

const photoUrlField = z.string().trim().url("each photo must be a valid URL").max(2048);

const photosField = z
  .array(photoUrlField, { invalid_type_error: "photos must be an array of URLs" })
  .max(10, "at most 10 photos are allowed")
  .optional();

const rateField = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than 0`)
    .max(100000, `${label} must be at most 100000`)
    .optional();

const isAvailableField = z.boolean().optional();

// isVerified is deliberately absent from both schemas below — it is set by
// an admin verification workflow, never by the tractor owner themselves.
export const createTractorProfileSchema = z
  .object({
    photos: photosField,
    mobile: mobileField,
    tractorType: shortTextField("tractorType"),
    model: shortTextField("model"),
    state: shortTextField("state"),
    district: shortTextField("district"),
    taluka: shortTextField("taluka"),
    village: shortTextField("village"),
    address: addressField,
    latitude: latitudeField,
    longitude: longitudeField,
    ratePerHour: rateField("ratePerHour"),
    ratePerDay: rateField("ratePerDay"),
    isAvailable: isAvailableField,
  })
  .refine((data) => data.ratePerHour !== undefined || data.ratePerDay !== undefined, {
    message: "At least one of ratePerHour or ratePerDay is required",
    path: ["ratePerHour"],
  });

export type CreateTractorProfileInput = z.infer<typeof createTractorProfileSchema>;

// Same shape as create, but every field is optional — a PUT here is a
// partial update, not a full replace. At least one field must be supplied,
// and if the update touches either rate it can't leave both empty.
export const updateTractorProfileSchema = z
  .object({
    photos: photosField,
    mobile: mobileField.optional(),
    tractorType: shortTextField("tractorType").optional(),
    model: shortTextField("model").optional(),
    state: shortTextField("state").optional(),
    district: shortTextField("district").optional(),
    taluka: shortTextField("taluka").optional(),
    village: shortTextField("village").optional(),
    address: addressField.optional(),
    latitude: latitudeField,
    longitude: longitudeField,
    ratePerHour: rateField("ratePerHour"),
    ratePerDay: rateField("ratePerDay"),
    isAvailable: isAvailableField,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the profile",
  });

export type UpdateTractorProfileInput = z.infer<typeof updateTractorProfileSchema>;

// A dedicated schema for just flipping availability on/off, mirrors
// setAvailabilitySchema in labour.validator.ts.
export const setTractorAvailabilitySchema = z.object({
  isAvailable: z.boolean({ required_error: "isAvailable is required" }),
});

export type SetTractorAvailabilityInput = z.infer<typeof setTractorAvailabilitySchema>;

// Query params arrive as strings, so numbers are coerced explicitly rather
// than relying on z.coerce everywhere. Mirrors searchLabourQuerySchema.
export const searchTractorQuerySchema = z
  .object({
    tractorType: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    district: z.string().trim().min(1).optional(),
    // Which rate field minRate/maxRate compares against. Defaults to
    // matching either field (a tractor with either rate in range counts)
    // when omitted, since a farmer may not care whether the quote is
    // hourly or daily.
    rateType: z.enum(["HOURLY", "DAILY"]).optional(),
    minRate: z.coerce
      .number({ invalid_type_error: "minRate must be a number" })
      .nonnegative("minRate cannot be negative")
      .optional(),
    maxRate: z.coerce
      .number({ invalid_type_error: "maxRate must be a number" })
      .nonnegative("maxRate cannot be negative")
      .optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(50).optional().default(20),
  })
  .refine(
    (data) =>
      data.minRate === undefined || data.maxRate === undefined || data.minRate <= data.maxRate,
    { message: "minRate cannot be greater than maxRate", path: ["minRate"] }
  );

export type SearchTractorQuery = z.infer<typeof searchTractorQuerySchema>;

// Fixed set of selectable radii for nearby search (Step 31) — mirrors
// labour.validator.ts's NEARBY_RADIUS_KM_OPTIONS exactly; kept as its own
// copy here rather than a shared import, same reasoning as this
// codebase's other small cross-validator duplications (see
// location.validator.ts's latitudeField/longitudeField comment).
const NEARBY_RADIUS_KM_OPTIONS = [5, 10, 25, 50] as const;

// Query params arrive as strings, so latitude/longitude/radiusKm are all
// coerced. latitude/longitude are required — nearby search is always
// relative to a caller-supplied point — while radiusKm is optional and
// defaults to 5, per the Step 31 requirement.
export const nearbyTractorQuerySchema = z.object({
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

export type NearbyTractorQuery = z.infer<typeof nearbyTractorQuerySchema>;
