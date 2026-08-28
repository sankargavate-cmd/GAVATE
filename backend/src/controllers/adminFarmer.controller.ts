import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as adminFarmerService from "../services/adminFarmer.service";
import {
  farmerProfileIdParamSchema,
  listPendingFarmerQuerySchema,
  rejectFarmerSchema,
} from "../validators/adminFarmer.validator";

// requireAuth + requireRole(Role.ADMIN) always run before these handlers
// (see adminFarmer.routes.ts), so req.user is guaranteed to be an
// authenticated admin here.

export async function listPending(req: Request, res: Response) {
  const parsed = listPendingFarmerQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await adminFarmerService.listPendingFarmerProfiles(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Pending farmer profiles fetched successfully",
  });
}

export async function getById(req: Request, res: Response) {
  const parsedParams = farmerProfileIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const profile = await adminFarmerService.getFarmerProfileById(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: profile,
    message: "Farmer profile fetched successfully",
  });
}

export async function approve(req: Request, res: Response) {
  const parsedParams = farmerProfileIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const profile = await adminFarmerService.approveFarmerProfile(
    parsedParams.data.id,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: profile,
    message: "Farmer profile approved successfully",
  });
}

export async function reject(req: Request, res: Response) {
  const parsedParams = farmerProfileIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const parsedBody = rejectFarmerSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError("Validation failed", 400, parsedBody.error.flatten().fieldErrors);
  }

  const profile = await adminFarmerService.rejectFarmerProfile(
    parsedParams.data.id,
    req.user!.id,
    parsedBody.data
  );

  res.status(200).json({
    success: true,
    data: profile,
    message: "Farmer profile rejected successfully",
  });
}
