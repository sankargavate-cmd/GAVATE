import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as workRequestService from "../services/workRequest.service";
import * as workRequestPaymentService from "../services/workRequestPayment.service";
import {
  createWorkRequestSchema,
  listWorkRequestsQuerySchema,
  respondWorkRequestSchema,
} from "../validators/workRequest.validator";
import { createCashfreeOrderSchema } from "../validators/payment.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// workRequest.routes.ts), so req.user is guaranteed to be populated here.

export async function createWorkRequest(req: Request, res: Response) {
  const parsed = createWorkRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const request = await workRequestService.createWorkRequest(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: request,
    message: "Work request sent successfully",
  });
}

/**
 * Lists the caller's own work requests — which side of the relationship
 * ("sent" vs "received") depends on their role, since both a farmer and a
 * labour user hit the same GET / route.
 */
export async function listMyWorkRequests(req: Request, res: Response) {
  const parsed = listWorkRequestsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result =
    req.user!.role === Role.FARMER
      ? await workRequestService.listSentWorkRequests(req.user!.id, parsed.data)
      : await workRequestService.listReceivedWorkRequests(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Work requests fetched successfully",
  });
}

export async function getWorkRequestById(req: Request, res: Response) {
  const request = await workRequestService.getOwnWorkRequestById(
    req.user!.id,
    req.user!.role,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: request,
    message: "Work request fetched successfully",
  });
}

export async function cancelWorkRequest(req: Request, res: Response) {
  const request = await workRequestService.cancelWorkRequest(req.user!.id, req.params.id);

  res.status(200).json({
    success: true,
    data: request,
    message: "Work request cancelled successfully",
  });
}

// --- Labour service payment integration (Step 36) ---
// Farmer-only (see workRequest.routes.ts). Reuses the same
// createCashfreeOrderSchema request body as POST
// /payments/:id/cashfree/order (Step 35) — this endpoint only accepts
// Cashfree customer-contact fields, never an amount or a payment
// status; the amount is always sourced server-side from the
// WorkRequest's own wage (see workRequestPayment.service.ts).
export async function initiateWorkRequestPayment(req: Request, res: Response) {
  const parsed = createCashfreeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await workRequestPaymentService.initiateWorkRequestPayment(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(201).json({
    success: true,
    data: {
      orderId: result.orderId,
      paymentSessionId: result.paymentSessionId,
      payment: result.payment,
    },
    message: "Cashfree order created successfully",
  });
}

export async function respondToWorkRequest(req: Request, res: Response) {
  const parsed = respondWorkRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const request = await workRequestService.respondToWorkRequest(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: request,
    message:
      parsed.data.action === "ACCEPT"
        ? "Work request accepted successfully"
        : "Work request rejected successfully",
  });
}
