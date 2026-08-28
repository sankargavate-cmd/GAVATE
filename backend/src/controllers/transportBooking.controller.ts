import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as transportBookingService from "../services/transportBooking.service";
import * as transportBookingPaymentService from "../services/transportBookingPayment.service";
import {
  createTransportBookingSchema,
  listTransportBookingsQuerySchema,
  respondTransportBookingSchema,
} from "../validators/transportBooking.validator";
import { createCashfreeOrderSchema } from "../validators/payment.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// transportBooking.routes.ts), so req.user is guaranteed to be populated
// here.

export async function createTransportBooking(req: Request, res: Response) {
  const parsed = createTransportBookingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const booking = await transportBookingService.createTransportBooking(
    req.user!.id,
    parsed.data
  );

  res.status(201).json({
    success: true,
    data: booking,
    message: "Transport booking sent successfully",
  });
}

/**
 * Lists the caller's own transport bookings — which side of the
 * relationship ("sent" vs "received") depends on their role, since both a
 * farmer and a transport provider hit the same GET / route.
 */
export async function listMyTransportBookings(req: Request, res: Response) {
  const parsed = listTransportBookingsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result =
    req.user!.role === Role.FARMER
      ? await transportBookingService.listSentTransportBookings(req.user!.id, parsed.data)
      : await transportBookingService.listReceivedTransportBookings(
          req.user!.id,
          parsed.data
        );

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Transport bookings fetched successfully",
  });
}

export async function getTransportBookingById(req: Request, res: Response) {
  const booking = await transportBookingService.getOwnTransportBookingById(
    req.user!.id,
    req.user!.role,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: booking,
    message: "Transport booking fetched successfully",
  });
}

export async function cancelTransportBooking(req: Request, res: Response) {
  const booking = await transportBookingService.cancelTransportBooking(
    req.user!.id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: booking,
    message: "Transport booking cancelled successfully",
  });
}

// --- Transport booking payment integration (Step 38) ---
// Farmer-only (see transportBooking.routes.ts). Reuses the same
// createCashfreeOrderSchema request body as POST
// /payments/:id/cashfree/order (Step 35), POST /work-requests/:id/pay
// (Step 36), and POST /tractor-bookings/:id/pay (Step 37) — this
// endpoint only accepts Cashfree customer-contact fields, never an
// amount or a payment status; the amount is always sourced server-side
// from the TransportBooking's own rate (see
// transportBookingPayment.service.ts).
export async function initiateTransportBookingPayment(req: Request, res: Response) {
  const parsed = createCashfreeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await transportBookingPaymentService.initiateTransportBookingPayment(
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

export async function respondToTransportBooking(req: Request, res: Response) {
  const parsed = respondTransportBookingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const booking = await transportBookingService.respondToTransportBooking(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: booking,
    message:
      parsed.data.action === "ACCEPT"
        ? "Transport booking accepted successfully"
        : "Transport booking rejected successfully",
  });
}
