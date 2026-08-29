import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as farmerService from "../services/farmer.service";
import {
  createFarmerProfileSchema,
  updateFarmerProfileSchema,
} from "../validators/farmer.validator";

// requireAuth always runs before these handlers (see farmer.routes.ts), so
// req.user is guaranteed to be populated here.

export async function createProfile(req: Request, res: Response) {
  const parsed = createFarmerProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await farmerService.createFarmerProfile(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: profile,
    message: "Farmer profile created successfully",
  });
}

export async function getProfile(req: Request, res: Response) {
  const profile = await farmerService.getFarmerProfile(req.user!.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Farmer profile fetched successfully",
  });
}

export async function updateProfile(req: Request, res: Response) {
  const parsed = updateFarmerProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const profile = await farmerService.updateFarmerProfile(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Farmer profile updated successfully",
  });
}
