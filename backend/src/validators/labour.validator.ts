import { z } from "zod";

// Indian 10-digit mobile numbers, optionally prefixed with +91 / 91 / 0.
// Stored normalized to the plain 10-digit form. Mirrors farmer.validator.ts.
const MOBILE_REGEX = /^(?:\+91|91|0)?([6-9]\d{9})$/;

const mobileField = z
  .string({ required_error: "mobile is required" })
  .trim()
  .regex(MOBILE_REGEX, "mobile must be a valid 10-digit Indian mobile number")
  .transform((value) => value.replace(MOBILE_REGEX, "$1"));

const profilePhotoField = z
  .string()
  .trim()
  .url("profilePhoto must be a valid URL")
  .max(2048)
  .optional();

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

const skillField = z
  .string()
  .trim()
  .min(2, "each skill must be at least 2 characters")
  .max(50, "each skill must be at most 50 characters");

const skillsField = z
  .array(skillField, { required_error: "skills is required" })
  .min(1, "at least one skill is required")
  .max(20, "at most 20 skills are allowed")
  // Normalize casing/whitespace and drop duplicates so search matching
  // (hasSome) behaves predictably regardless of how the client submitted it.
  .transform((skills) => Array.from(new Set(skills.map((s) => s.toLowerCase()))));

const experienceYearsField = z
  .number({ invalid_type_error: "experienceYears must be a number" })
  .int("experienceYears must be a whole number")
  .min(0, "experienceYears cannot be negative")
  .max(80, "experienceYears must be at most 80 years")
  .optional();

const dailyWageField = z
  .number({ required_error: "dailyWage is required" })
  .positive("dailyWage must be greater than 0")
  .max(100000, "dailyWage must be at most 100000");

const isAvailableField = z.boolean().optional();

// isVerified is deliberately absent from both schemas below — it is set by
// an admin verification workflow, never by the labour user themselves.
export const createLabourProfileSchema = z.object({
  profilePhoto: profilePhotoField,
  mobile: mobileField,
  skills: skillsField,
  experienceYears: experienceYearsField,
  state: shortTextField("state"),
  district: shortTextField("district"),
  taluka: shortTextField("taluka"),
  village: shortTextField("village"),
  address: addressField,
  latitude: latitudeField,
  longitude: longitudeField,
  dailyWage: dailyWageField,
  isAvailable: isAvailableField,
});

export type CreateLabourProfileInput = z.infer<typeof createLabourProfileSchema>;

// Same shape as create, but every field is optional — a PUT here is a
// partial update, not a full replace. At least one field must be supplied.
export const updateLabourProfileSchema = createLabourProfileSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the profile",
  });

export type UpdateLabourProfileInput = z.infer<typeof updateLabourProfileSchema>;

// A dedicated schema for just flipping availability on/off, since that's
// the one field a labour user is likely to update far more often than the
// rest of their profile (e.g. from a single toggle in the app).
export const setAvailabilitySchema = z.object({
  isAvailable: z.boolean({ required_error: "isAvailable is required" }),
});

export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

// Query params arrive as strings, so numbers/booleans/arrays are coerced
// and parsed explicitly rather than relying on z.coerce everywhere.
export const searchLabourQuerySchema = z
  .object({
    skills: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value
          ? Array.from(
              new Set(
                value
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean)
              )
            )
          : undefined
      ),
    state: z.string().trim().min(1).optional(),
    district: z.string().trim().min(1).optional(),
    minWage: z.coerce
      .number({ invalid_type_error: "minWage must be a number" })
      .nonnegative("minWage cannot be negative")
      .optional(),
    maxWage: z.coerce
      .number({ invalid_type_error: "maxWage must be a number" })
      .nonnegative("maxWage cannot be negative")
      .optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(50).optional().default(20),
  })
  .refine(
    (data) =>
      data.minWage === undefined ||
      data.maxWage === undefined ||
      data.minWage <= data.maxWage,
    { message: "minWage cannot be greater than maxWage", path: ["minWage"] }
  );

export type SearchLabourQuery = z.infer<typeof searchLabourQuerySchema>;

// Fixed set of selectable radii for nearby search (Step 31) — kept as an
// explicit allow-list rather than an open-ended positive number so a
// caller can't request an unbounded/huge radius that would turn this
// into an expensive full-table distance scan. Mirrors
// REQUIRED_BUYER_DOCUMENT_TYPES's "small, explicit allow-list" style in
// constants/buyerVerification.ts.
const NEARBY_RADIUS_KM_OPTIONS = [5, 10, 25, 50] as const;

// Query params arrive as strings, so latitude/longitude/radiusKm are all
// coerced. latitude/longitude are required — nearby search is always
// relative to a caller-supplied point, unlike location.validator.ts's
// own (optional, save-your-location) lat/lng fields — while radiusKm is
// optional and defaults to 5, per the Step 31 requirement.
export const nearbyLabourQuerySchema = z.object({
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

export type NearbyLabourQuery = z.infer<typeof nearbyLabourQuerySchema>;
