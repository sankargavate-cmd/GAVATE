import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as adminPaymentService from "../services/adminPayment.service";
import {
  adminPaymentIdParamSchema,
  listAdminPaymentsQuerySchema,
} from "../validators/adminPayment.validator";

// requireAuth + requireRole(Role.ADMIN) always run before these handlers
// (see adminPayment.routes.ts), so req.user is guaranteed to be an
// authenticated admin here — mirrors adminFarmer.controller.ts /
// adminLabour.controller.ts exactly.

export async function listPayments(req: Request, res: Response) {
  const parsed = listAdminPaymentsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await adminPaymentService.listAllPayments(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Payments fetched successfully",
  });
}

export async function getPaymentById(req: Request, res: Response) {
  const parsedParams = adminPaymentIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const payment = await adminPaymentService.getPaymentByIdForAdmin(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: payment,
    message: "Payment fetched successfully",
  });
}

// POST /api/v1/admin/payments/:id/reconcile — never reads a status from
// req.body; the only input is the :id param, and the record is only
// ever updated according to whatever Cashfree's server actually returns
// (see adminPaymentService.reconcilePayment / cashfreePaymentService's
// reconcilePaymentForAdmin doc comments).
export async function reconcilePayment(req: Request, res: Response) {
  const parsedParams = adminPaymentIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const payment = await adminPaymentService.reconcilePayment(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: payment,
    message: "Payment reconciled successfully",
  });
}
