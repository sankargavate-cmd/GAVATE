import { RatingTargetType } from "@prisma/client";
import { z } from "zod";

// Mirrors the RatingTargetType enum in schema.prisma — used both for the
// create-payload discriminator and for query-param filtering.
const RATING_TARGET_TYPES = Object.values(RatingTargetType) as [
  RatingTargetType,
  ...RatingTargetType[]
];

const targetTypeField = z.enum(RATING_TARGET_TYPES, {
  required_error: "targetType is required",
  invalid_type_error: `targetType must be one of: ${RATING_TARGET_TYPES.join(", ")}`,
});

// cuid() id of the underlying engagement being rated — a WorkRequest,
// TractorBooking, TransportBooking, or Order id depending on targetType
// (rating.service.ts resolves which one). Same shape as every other id in
// this codebase.
const referenceIdField = z
  .string({ required_error: "referenceId is required" })
  .trim()
  .min(1, "referenceId is required");

const ratingValueField = z
  .number({ required_error: "rating is required", invalid_type_error: "rating must be a number" })
  .int("rating must be a whole number")
  .min(1, "rating must be between 1 and 5")
  .max(5, "rating must be between 1 and 5");

// Optional written feedback. z.preprocess normalizes an empty string to
// undefined so a farmer submitting a blank textarea doesn't store "" —
// mirrors how other optional free-text fields in this codebase are
// generally left as either a real string or omitted entirely.
const reviewField = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().max(1000, "review must be at most 1000 characters").optional()
);

export const createRatingSchema = z.object({
  targetType: targetTypeField,
  referenceId: referenceIdField,
  rating: ratingValueField,
  review: reviewField,
});

export type CreateRatingInput = z.infer<typeof createRatingSchema>;

// Update is intentionally narrower than create — targetType/referenceId
// are immutable once a rating exists (which engagement it was left
// against never changes), so only the rating value and review text can be
// edited. At least one of the two must be present.
export const updateRatingSchema = z
  .object({
    rating: ratingValueField.optional(),
    review: reviewField,
  })
  .refine((data) => data.rating !== undefined || data.review !== undefined, {
    message: "At least one of rating or review must be provided",
  });

export type UpdateRatingInput = z.infer<typeof updateRatingSchema>;

// Shared list query for both "given" (farmer's own ratings) and
// "received" (a ratee's incoming ratings) views.
export const listRatingsQuerySchema = z.object({
  targetType: targetTypeField.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

export type ListRatingsQuery = z.infer<typeof listRatingsQuerySchema>;
