import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as orderService from "../services/order.service";
import * as orderPaymentService from "../services/orderPayment.service";
import {
  advanceOrderSchema,
  cancelOrderSchema,
  listOrdersQuerySchema,
} from "../validators/order.validator";
import { createCashfreeOrderSchema } from "../validators/payment.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// order.routes.ts), so req.user is guaranteed to be populated here.

/**
 * Lists the caller's own orders — a buyer sees orders they've made, a
 * farmer sees orders received on their listings. Which side is queried
 * depends on their role, since both hit the same GET / route (mirrors
 * listMyOffers in produceOffer.controller.ts).
 */
export async function listMyOrders(req: Request, res: Response) {
  const parsed = listOrdersQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result =
    req.user!.role === Role.BUYER
      ? await orderService.listBuyerOrders(req.user!.id, parsed.data)
      : await orderService.listFarmerOrders(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Orders fetched successfully",
  });
}

export async function getOrderById(req: Request, res: Response) {
  const order = await orderService.getOwnOrderById(req.user!.id, req.user!.role, req.params.id);

  res.status(200).json({
    success: true,
    data: order,
    message: "Order fetched successfully",
  });
}

export async function getOrderHistory(req: Request, res: Response) {
  const history = await orderService.getOwnOrderHistory(
    req.user!.id,
    req.user!.role,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: history,
    message: "Order history fetched successfully",
  });
}

// --- Marketplace / Produce Order payment integration (Step 39) ---
// Buyer-only (see order.routes.ts). Reuses the same
// createCashfreeOrderSchema request body as POST
// /payments/:id/cashfree/order (Step 35), POST /work-requests/:id/pay
// (Step 36), POST /tractor-bookings/:id/pay (Step 37), and POST
// /transport-bookings/:id/pay (Step 38) — this endpoint only accepts
// Cashfree customer-contact fields, never an amount or a payment
// status; the amount is always sourced server-side from the Order's own
// totalAmount (see orderPayment.service.ts).
export async function initiateOrderPayment(req: Request, res: Response) {
  const parsed = createCashfreeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await orderPaymentService.initiateOrderPayment(
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

export async function advanceOrder(req: Request, res: Response) {
  const parsed = advanceOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const order = await orderService.advanceOrder(
    req.user!.id,
    req.user!.role,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: order,
    message: `Order moved to ${order.status}`,
  });
}

export async function cancelOrder(req: Request, res: Response) {
  const parsed = cancelOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const order = await orderService.cancelOrder(
    req.user!.id,
    req.user!.role,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: order,
    message: "Order cancelled successfully",
  });
}
