import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as labourService from "../services/labour.service";
import {
  createLabourProfileSchema,
  nearbyLabourQuerySchema,
  searchLabourQuerySchema,
  setAvailabilitySchema,
  updateLabourProfileSchema,
} from "../validators/labour.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// labour.routes.ts), so req.user is guaranteed to be populated here.

export async function createProfile(req: Request, res: Response) {
  const parsed = createLabourProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await labourService.createLabourProfile(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: profile,
    message: "Labour profile created successfully",
  });
}

export async function getProfile(req: Request, res: Response) {
  const profile = await labourService.getLabourProfile(req.user!.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Labour profile fetched successfully",
  });
}

export async function updateProfile(req: Request, res: Response) {
  const parsed = updateLabourProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await labourService.updateLabourProfile(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Labour profile updated successfully",
  });
}

export async function updateAvailability(req: Request, res: Response) {
  const parsed = setAvailabilitySchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await labourService.setAvailability(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Availability updated successfully",
  });
}

export async function searchLabour(req: Request, res: Response) {
  const parsed = searchLabourQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await labourService.searchVerifiedLabour(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Labour listings fetched successfully",
  });
}

export async function nearbyLabour(req: Request, res: Response) {
  const parsed = nearbyLabourQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const { latitude, longitude, radiusKm } = parsed.data;
  const results = await labourService.findNearbyVerifiedLabour(
    { latitude, longitude },
    radiusKm,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: results.map(({ item, distanceKm }) => ({ ...item, distanceKm })),
    message: "Nearby labour fetched successfully",
  });
}

export async function getLabourById(req: Request, res: Response) {
  const profile = await labourService.getVerifiedLabourById(req.params.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Labour listing fetched successfully",
  });
}
