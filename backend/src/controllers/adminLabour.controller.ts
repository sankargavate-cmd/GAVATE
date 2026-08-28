import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as adminLabourService from "../services/adminLabour.service";
import {
  labourProfileIdParamSchema,
  listPendingLabourQuerySchema,
  rejectLabourSchema,
} from "../validators/adminLabour.validator";

// requireAuth + requireRole(Role.ADMIN) always run before these handlers
// (see adminLabour.routes.ts), so req.user is guaranteed to be an
// authenticated admin here.

export async function listPending(req: Request, res: Response) {
  const parsed = listPendingLabourQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await adminLabourService.listPendingLabourProfiles(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Pending labour profiles fetched successfully",
  });
}

export async function approve(req: Request, res: Response) {
  const parsedParams = labourProfileIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const profile = await adminLabourService.approveLabourProfile(
    parsedParams.data.id,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: profile,
    message: "Labour profile approved successfully",
  });
}

export async function reject(req: Request, res: Response) {
  const parsedParams = labourProfileIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const parsedBody = rejectLabourSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError("Validation failed", 400, parsedBody.error.flatten().fieldErrors);
  }

  const profile = await adminLabourService.rejectLabourProfile(
    parsedParams.data.id,
    req.user!.id,
    parsedBody.data
  );

  res.status(200).json({
    success: true,
    data: profile,
    message: "Labour profile rejected successfully",
  });
}
