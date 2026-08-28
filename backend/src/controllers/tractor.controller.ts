import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as tractorService from "../services/tractor.service";
import {
  createTractorProfileSchema,
  nearbyTractorQuerySchema,
  searchTractorQuerySchema,
  setTractorAvailabilitySchema,
  updateTractorProfileSchema,
} from "../validators/tractor.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// tractor.routes.ts), so req.user is guaranteed to be populated here.

export async function createProfile(req: Request, res: Response) {
  const parsed = createTractorProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await tractorService.createTractorProfile(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: profile,
    message: "Tractor profile created successfully",
  });
}

export async function getProfile(req: Request, res: Response) {
  const profile = await tractorService.getTractorProfile(req.user!.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Tractor profile fetched successfully",
  });
}

export async function updateProfile(req: Request, res: Response) {
  const parsed = updateTractorProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await tractorService.updateTractorProfile(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Tractor profile updated successfully",
  });
}

export async function updateAvailability(req: Request, res: Response) {
  const parsed = setTractorAvailabilitySchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await tractorService.setTractorAvailability(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Availability updated successfully",
  });
}

export async function searchTractors(req: Request, res: Response) {
  const parsed = searchTractorQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await tractorService.searchVerifiedTractors(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Tractor listings fetched successfully",
  });
}

export async function nearbyTractors(req: Request, res: Response) {
  const parsed = nearbyTractorQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const { latitude, longitude, radiusKm } = parsed.data;
  const results = await tractorService.findNearbyVerifiedTractors(
    { latitude, longitude },
    radiusKm,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: results.map(({ item, distanceKm }) => ({ ...item, distanceKm })),
    message: "Nearby tractors fetched successfully",
  });
}

export async function getTractorById(req: Request, res: Response) {
  const profile = await tractorService.getVerifiedTractorById(req.params.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Tractor listing fetched successfully",
  });
}

export async function getTractorAvailability(req: Request, res: Response) {
  const availability = await tractorService.getTractorAvailability(req.params.id);

  res.status(200).json({
    success: true,
    data: availability,
    message: "Tractor availability fetched successfully",
  });
}
