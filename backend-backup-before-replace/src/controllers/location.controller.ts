import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as locationService from "../services/location.service";
import { updateLocationSchema } from "../validators/location.validator";

// requireAuth always runs before these handlers (see location.routes.ts),
// so req.user is guaranteed to be populated here. Unlike most other
// controllers in this codebase, no requireRole is applied — location is
// role-agnostic and available to every authenticated user.

export async function getMyLocation(req: Request, res: Response) {
  const location = await locationService.getMyLocation(req.user!.id);

  res.status(200).json({
    success: true,
    data: location,
    message: "Location fetched successfully",
  });
}

export async function updateMyLocation(req: Request, res: Response) {
  const parsed = updateLocationSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const location = await locationService.updateMyLocation(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: location,
    message: "Location updated successfully",
  });
}
