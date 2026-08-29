import { ProduceUnit } from "@prisma/client";
import { z } from "zod";

// Mirrors the ProduceUnit enum in schema.prisma — kept as a fixed allow-list
// so quantity/price are always comparable across listings (no free-text
// "kg", "kilos", "Kg" variants to normalize later).
const PRODUCE_UNITS = Object.values(ProduceUnit) as [ProduceUnit, ...ProduceUnit[]];

const cropField = z
  .string({ required_error: "crop is required" })
  .trim()
  .min(2, "crop must be at least 2 characters")
  .max(100, "crop must be at most 100 characters");

const quantityField = z
  .number({ required_error: "quantity is required", invalid_type_error: "quantity must be a number" })
  .positive("quantity must be greater than 0")
  .max(1_000_000, "quantity must be at most 1,000,000");

const unitField = z.enum(PRODUCE_UNITS, {
  required_error: "unit is required",
  invalid_type_error: `unit must be one of: ${PRODUCE_UNITS.join(", ")}`,
});

const priceField = z
  .number({ required_error: "price is required", invalid_type_error: "price must be a number" })
  .positive("price must be greater than 0")
  .max(10_000_000, "price must be at most 10,000,000");

const locationField = z
  .string({ required_error: "location is required" })
  .trim()
  .min(2, "location must be at least 2 characters")
  .max(200, "location must be at most 200 characters");

const descriptionField = z
  .string()
  .trim()
  .max(1000, "description must be at most 1000 characters")
  .optional();

const photoUrlField = z.string().trim().url("each photo must be a valid URL").max(2048);

const photosField = z
  .array(photoUrlField, { invalid_type_error: "photos must be an array of URLs" })
  .max(10, "at most 10 photos are allowed")
  .optional();

const isActiveField = z.boolean().optional();

// isVerified/verification status is deliberately absent here — a listing's
// visibility to buyers is derived from the owning farmer's FarmerProfile
// verification (Step 17), not settable on the listing itself.
export const createProduceListingSchema = z.object({
  crop: cropField,
  quantity: quantityField,
  unit: unitField,
  price: priceField,
  location: locationField,
  description: descriptionField,
  photos: photosField,
  isActive: isActiveField,
});

export type CreateProduceListingInput = z.infer<typeof createProduceListingSchema>;

// Same shape as create, but every field is optional — a PUT here is a
// partial update, not a full replace. At least one field must be supplied.
export const updateProduceListingSchema = createProduceListingSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update the listing",
  });

export type UpdateProduceListingInput = z.infer<typeof updateProduceListingSchema>;

// Query params arrive as strings, so numbers are coerced explicitly rather
// than relying on z.coerce everywhere. Mirrors searchLabourQuerySchema.
export const searchProduceQuerySchema = z
  .object({
    crop: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    unit: z.enum(PRODUCE_UNITS).optional(),
    minPrice: z.coerce
      .number({ invalid_type_error: "minPrice must be a number" })
      .nonnegative("minPrice cannot be negative")
      .optional(),
    maxPrice: z.coerce
      .number({ invalid_type_error: "maxPrice must be a number" })
      .nonnegative("maxPrice cannot be negative")
      .optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(50).optional().default(20),
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    { message: "minPrice cannot be greater than maxPrice", path: ["minPrice"] }
  );

export type SearchProduceQuery = z.infer<typeof searchProduceQuerySchema>;

// Farmer's own listings view — no verification/visibility filters apply
// here (a farmer sees all of their own listings, active or not), but it's
// still paginated the same way as search.
export const listOwnProduceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

export type ListOwnProduceQuery = z.infer<typeof listOwnProduceQuerySchema>;
