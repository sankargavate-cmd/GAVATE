import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as transportService from "../services/transport.service";
import {
  createTransportProfileSchema,
  nearbyTransportQuerySchema,
  searchTransportQuerySchema,
  setTransportAvailabilitySchema,
  updateTransportProfileSchema,
} from "../validators/transport.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// transport.routes.ts), so req.user is guaranteed to be populated here.

export async function createProfile(req: Request, res: Response) {
  const parsed = createTransportProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await transportService.createTransportProfile(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: profile,
    message: "Transport profile created successfully",
  });
}

export async function getProfile(req: Request, res: Response) {
  const profile = await transportService.getTransportProfile(req.user!.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Transport profile fetched successfully",
  });
}

export async function updateProfile(req: Request, res: Response) {
  const parsed = updateTransportProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await transportService.updateTransportProfile(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Transport profile updated successfully",
  });
}

export async function updateAvailability(req: Request, res: Response) {
  const parsed = setTransportAvailabilitySchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await transportService.setTransportAvailability(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Availability updated successfully",
  });
}

export async function searchTransportProviders(req: Request, res: Response) {
  const parsed = searchTransportQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await transportService.searchVerifiedTransportProviders(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Transport listings fetched successfully",
  });
}

export async function nearbyTransportProviders(req: Request, res: Response) {
  const parsed = nearbyTransportQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const { latitude, longitude, radiusKm } = parsed.data;
  const results = await transportService.findNearbyVerifiedTransportProviders(
    { latitude, longitude },
    radiusKm,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: results.map(({ item, distanceKm }) => ({ ...item, distanceKm })),
    message: "Nearby transport providers fetched successfully",
  });
}

export async function getTransportById(req: Request, res: Response) {
  const profile = await transportService.getVerifiedTransportById(req.params.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Transport listing fetched successfully",
  });
}

export async function getTransportAvailability(req: Request, res: Response) {
  const availability = await transportService.getTransportAvailability(req.params.id);

  res.status(200).json({
    success: true,
    data: availability,
    message: "Transport availability fetched successfully",
  });
}
