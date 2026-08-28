import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as ratingService from "../services/rating.service";
import {
  createRatingSchema,
  listRatingsQuerySchema,
  updateRatingSchema,
} from "../validators/rating.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// rating.routes.ts), so req.user is guaranteed to be populated here.

export async function createRating(req: Request, res: Response) {
  const parsed = createRatingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const rating = await ratingService.createRating(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: rating,
    message: "Rating submitted successfully",
  });
}

export async function updateRating(req: Request, res: Response) {
  const parsed = updateRatingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const rating = await ratingService.updateRating(req.user!.id, req.params.id, parsed.data);

  res.status(200).json({
    success: true,
    data: rating,
    message: "Rating updated successfully",
  });
}

export async function deleteRating(req: Request, res: Response) {
  await ratingService.deleteRating(req.user!.id, req.params.id);

  res.status(200).json({
    success: true,
    data: null,
    message: "Rating deleted successfully",
  });
}

export async function getRatingById(req: Request, res: Response) {
  const rating = await ratingService.getOwnRatingById(req.user!.id, req.params.id);

  res.status(200).json({
    success: true,
    data: rating,
    message: "Rating fetched successfully",
  });
}

export async function listGivenRatings(req: Request, res: Response) {
  const parsed = listRatingsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await ratingService.listGivenRatings(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Ratings fetched successfully",
  });
}

export async function listReceivedRatings(req: Request, res: Response) {
  const parsed = listRatingsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await ratingService.listReceivedRatings(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Ratings fetched successfully",
  });
}

/**
 * Public (any authenticated user) summary + review list for a specific
 * ratee — e.g. what a farmer sees on a Labour/Tractor/Transport detail
 * page. req.params.userId is the ratee being looked up, not the caller.
 */
export async function getUserRatingSummary(req: Request, res: Response) {
  const parsed = listRatingsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await ratingService.getUserRatingSummary(req.params.userId, parsed.data);

  res.status(200).json({
    success: true,
    data: {
      averageRating: result.averageRating,
      ratingCount: result.ratingCount,
      reviews: result.items,
    },
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Rating summary fetched successfully",
  });
}
