import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as tractorBookingService from "../services/tractorBooking.service";
import * as tractorBookingPaymentService from "../services/tractorBookingPayment.service";
import {
  createTractorBookingSchema,
  listTractorBookingsQuerySchema,
  respondTractorBookingSchema,
} from "../validators/tractorBooking.validator";
import { createCashfreeOrderSchema } from "../validators/payment.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// tractorBooking.routes.ts), so req.user is guaranteed to be populated here.

export async function createTractorBooking(req: Request, res: Response) {
  const parsed = createTractorBookingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const booking = await tractorBookingService.createTractorBooking(
    req.user!.id,
    parsed.data
  );

  res.status(201).json({
    success: true,
    data: booking,
    message: "Tractor booking sent successfully",
  });
}

/**
 * Lists the caller's own tractor bookings — which side of the relationship
 * ("sent" vs "received") depends on their role, since both a farmer and a
 * tractor owner hit the same GET / route.
 */
export async function listMyTractorBookings(req: Request, res: Response) {
  const parsed = listTractorBookingsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result =
    req.user!.role === Role.FARMER
      ? await tractorBookingService.listSentTractorBookings(req.user!.id, parsed.data)
      : await tractorBookingService.listReceivedTractorBookings(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Tractor bookings fetched successfully",
  });
}

export async function getTractorBookingById(req: Request, res: Response) {
  const booking = await tractorBookingService.getOwnTractorBookingById(
    req.user!.id,
    req.user!.role,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: booking,
    message: "Tractor booking fetched successfully",
  });
}

export async function cancelTractorBooking(req: Request, res: Response) {
  const booking = await tractorBookingService.cancelTractorBooking(
    req.user!.id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: booking,
    message: "Tractor booking cancelled successfully",
  });
}

// --- Tractor booking payment integration (Step 37) ---
// Farmer-only (see tractorBooking.routes.ts). Reuses the same
// createCashfreeOrderSchema request body as POST
// /payments/:id/cashfree/order (Step 35) and POST
// /work-requests/:id/pay (Step 36) — this endpoint only accepts
// Cashfree customer-contact fields, never an amount or a payment
// status; the amount is always sourced server-side from the
// TractorBooking's own rate (see tractorBookingPayment.service.ts).
export async function initiateTractorBookingPayment(req: Request, res: Response) {
  const parsed = createCashfreeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await tractorBookingPaymentService.initiateTractorBookingPayment(
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

export async function respondToTractorBooking(req: Request, res: Response) {
  const parsed = respondTractorBookingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const booking = await tractorBookingService.respondToTractorBooking(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: booking,
    message:
      parsed.data.action === "ACCEPT"
        ? "Tractor booking accepted successfully"
        : "Tractor booking rejected successfully",
  });
}
