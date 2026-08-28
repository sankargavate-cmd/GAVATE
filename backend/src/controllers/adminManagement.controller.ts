import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as adminManagementService from "../services/adminManagement.service";
import {
  adminIdParamSchema,
  assignPermissionsSchema,
  createAdminSchema,
  listAdminsQuerySchema,
  resetAdminPasswordSchema,
} from "../validators/adminManagement.validator";

// requireAuth + requireRole(Role.SUPER_ADMIN) always run before these
// handlers (see adminManagement.routes.ts), so req.user is guaranteed to
// be an authenticated super admin here.

export async function createAdmin(req: Request, res: Response) {
  const parsed = createAdminSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const admin = await adminManagementService.createAdmin(parsed.data, req.user!.id);

  res.status(201).json({
    success: true,
    data: admin,
    message: "Admin created successfully",
  });
}

export async function listAdmins(req: Request, res: Response) {
  const parsed = listAdminsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await adminManagementService.listAdmins(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Admins fetched successfully",
  });
}

export async function getAdmin(req: Request, res: Response) {
  const parsedParams = adminIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const admin = await adminManagementService.getAdminById(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: admin,
    message: "Admin fetched successfully",
  });
}

export async function activateAdmin(req: Request, res: Response) {
  const parsedParams = adminIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const admin = await adminManagementService.activateAdmin(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: admin,
    message: "Admin activated successfully",
  });
}

export async function deactivateAdmin(req: Request, res: Response) {
  const parsedParams = adminIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const admin = await adminManagementService.deactivateAdmin(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: admin,
    message: "Admin deactivated successfully",
  });
}

export async function removeAdminAccess(req: Request, res: Response) {
  const parsedParams = adminIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const admin = await adminManagementService.removeAdminAccess(
    parsedParams.data.id,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: admin,
    message: "Admin access removed successfully",
  });
}

export async function resetAdminPassword(req: Request, res: Response) {
  const parsedParams = adminIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const parsedBody = resetAdminPasswordSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError("Validation failed", 400, parsedBody.error.flatten().fieldErrors);
  }

  const result = await adminManagementService.resetAdminPassword(
    parsedParams.data.id,
    parsedBody.data.newPassword
  );

  res.status(200).json({
    success: true,
    data: {
      admin: result.admin,
      temporaryPassword: result.temporaryPassword,
    },
    message:
      "Password reset successfully. Share the temporary password with the admin through a secure channel — it will not be shown again.",
  });
}

export async function assignPermissions(req: Request, res: Response) {
  const parsedParams = adminIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const parsedBody = assignPermissionsSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError("Validation failed", 400, parsedBody.error.flatten().fieldErrors);
  }

  const admin = await adminManagementService.assignPermissions(
    parsedParams.data.id,
    parsedBody.data
  );

  res.status(200).json({
    success: true,
    data: admin,
    message: "Permissions updated successfully",
  });
}
