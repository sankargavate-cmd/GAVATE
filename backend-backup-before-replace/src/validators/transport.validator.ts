import { CapacityUnit } from "@prisma/client";
import { z } from "zod";

// Mirrors the CapacityUnit enum in schema.prisma — used for both the
// create/update payload and query-param filtering.
const CAPACITY_UNITS = Object.values(CapacityUnit) as [CapacityUnit, ...CapacityUnit[]];

// Indian 10-digit mobile numbers, optionally prefixed with +91 / 91 / 0.
// Stored normalized to the plain 10-digit form. Mirrors labour.validator.ts
// / tractor.validator.ts.
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

// Vehicle registration numbers vary in exact format across states, so this
// is a loose length/charset check rather than a strict pattern — mirrors
// how tractorType/model are kept as free text.
const vehicleNumberField = z
  .string({ required_error: "vehicleNumber is required" })
  .trim()
  .min(4, "vehicleNumber must be at least 4 characters")
  .max(20, "vehicleNumber must be at most 20 characters");

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

const capacityField = z
  .number({ required_error: "capacity is required", invalid_type_error: "capacity must be a number" })
  .positive("capacity must be greater than 0")
  .max(100000, "capacity must be at most 100000");

const capacityUnitField = z.enum(CAPACITY_UNITS, {
  required_error: "capacityUnit is required",
  invalid_type_error: `capacityUnit must be one of: ${CAPACITY_UNITS.join(", ")}`,
});

const rateField = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than 0`)
    .max(100000, `${label} must be at most 100000`)
    .optional();

const isAvailableField = z.boolean().optional();

// isVerified is deliberately absent from both schemas below — it is set by
// an admin verification workflow, never by the transport provider
// themselves. Mirrors createTractorProfileSchema.
export const createTransportProfileSchema = z
  .object({
    photos: photosField,
    mobile: mobileField,
    vehicleType: shortTextField("vehicleType"),
    vehicleNumber: vehicleNumberField,
    capacity: capacityField,
    capacityUnit: capacityUnitField,
    state: shortTextField("state"),
    district: shortTextField("district"),
    taluka: shortTextField("taluka"),
    village: shortTextField("village"),
    address: addressField,
    latitude: latitudeField,
    longitude: longitudeField,
    ratePerKm: rateField("ratePerKm"),
    ratePerTrip: rateField("ratePerTrip"),
    isAvailable: isAvailableField,
  })
  .refine((data) => data.ratePerKm !== undefined || data.ratePerTrip !== undefined, {
    message: "At least one of ratePerKm or ratePerTrip is required",
    path: ["ratePerKm"],
  });

export type CreateTransportProfileInput = z.infer<typeof createTransportProfileSchema>;

// Same shape as create, but every field is optional — a PUT here is a
// partial update, not a full replace. At least one field must be supplied,
// and if the update touches either rate it can't leave both empty.
export const updateTransportProfileSchema = z
  .object({
    photos: photosField,
    mobile: mobileField.optional(),
    vehicleType: shortTextField("vehicleType").optional(),
    vehicleNumber: vehicleNumberField.optional(),
    capacity: capacityField.optional(),
    capacityUnit: capacityUnitField.optional(),
    state: shortTextField("state").optional(),
    district: shortTextField("district").optional(),
    taluka: shortTextField("taluka").optional(),
    village: shortTextField("village").optional(),
    address: addressField.optional(),
    latitude: latitudeField,
    longitude: longitudeField,
    ratePerKm: rateField("ratePerKm"),
    ratePerTrip: rateField("ratePerTrip"),
    isAvailable: isAvailableField,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the profile",
  });

export type UpdateTransportProfileInput = z.infer<typeof updateTransportProfileSchema>;

// A dedicated schema for just flipping availability on/off, mirrors
// setTractorAvailabilitySchema.
export const setTransportAvailabilitySchema = z.object({
  isAvailable: z.boolean({ required_error: "isAvailable is required" }),
});

export type SetTransportAvailabilityInput = z.infer<typeof setTransportAvailabilitySchema>;

// Query params arrive as strings, so numbers are coerced explicitly rather
// than relying on z.coerce everywhere. Mirrors searchTractorQuerySchema.
export const searchTransportQuerySchema = z
  .object({
    vehicleType: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    district: z.string().trim().min(1).optional(),
    capacityUnit: z.enum(CAPACITY_UNITS).optional(),
    minCapacity: z.coerce
      .number({ invalid_type_error: "minCapacity must be a number" })
      .nonnegative("minCapacity cannot be negative")
      .optional(),
    maxCapacity: z.coerce
      .number({ invalid_type_error: "maxCapacity must be a number" })
      .nonnegative("maxCapacity cannot be negative")
      .optional(),
    // Which rate field minRate/maxRate compares against. Defaults to
    // matching either field (a provider with either rate in range counts)
    // when omitted, since a farmer may not care whether the quote is
    // per-km or per-trip.
    rateType: z.enum(["PER_KM", "PER_TRIP"]).optional(),
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
  )
  .refine(
    (data) =>
      data.minCapacity === undefined ||
      data.maxCapacity === undefined ||
      data.minCapacity <= data.maxCapacity,
    { message: "minCapacity cannot be greater than maxCapacity", path: ["minCapacity"] }
  );

export type SearchTransportQuery = z.infer<typeof searchTransportQuerySchema>;

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
export const nearbyTransportQuerySchema = z.object({
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

export type NearbyTransportQuery = z.infer<typeof nearbyTransportQuerySchema>;
