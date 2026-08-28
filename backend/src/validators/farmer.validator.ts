import { z } from "zod";

// Indian 10-digit mobile numbers, optionally prefixed with +91 / 91 / 0.
// Stored normalized to the plain 10-digit form.
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

const farmingExperienceField = z
  .number({ required_error: "farmingExperience is required" })
  .int("farmingExperience must be a whole number")
  .min(0, "farmingExperience cannot be negative")
  .max(100, "farmingExperience must be at most 100 years");

export const createFarmerProfileSchema = z.object({
  profilePhoto: profilePhotoField,
  mobile: mobileField,
  state: shortTextField("state"),
  district: shortTextField("district"),
  taluka: shortTextField("taluka"),
  village: shortTextField("village"),
  address: addressField,
  latitude: latitudeField,
  longitude: longitudeField,
  farmingExperience: farmingExperienceField,
});

export type CreateFarmerProfileInput = z.infer<typeof createFarmerProfileSchema>;

// Same shape as create, but every field is optional — a PUT here is a
// partial update, not a full replace. At least one field must be supplied.
export const updateFarmerProfileSchema = createFarmerProfileSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the profile",
  });

export type UpdateFarmerProfileInput = z.infer<typeof updateFarmerProfileSchema>;
