import { Request, Response } from "express";
import * as cashfreePaymentService from "../services/cashfreePayment.service";
import { AppError } from "../middlewares/errorHandler";
import * as paymentService from "../services/payment.service";
import {
  createCashfreeOrderSchema,
  initiateRefundSchema,
  listMyPaymentsQuerySchema,
} from "../validators/payment.validator";

// requireAuth always runs before these handlers (see payment.routes.ts),
// so req.user is guaranteed to be populated here — every handler below
// scopes strictly to req.user!.id so a user can only ever see their own
// payment records, mirroring notification.controller.ts.

export async function getMyPayments(req: Request, res: Response) {
  const parsed = listMyPaymentsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await paymentService.getMyPayments(req.user!.id, parsed.data);

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

// --- Cashfree Payment Gateway integration (Step 35) ---
// Both handlers below scope strictly to req.user!.id via
// cashfreePaymentService, which forwards straight into
// paymentService.getPaymentById — the same 404-on-mismatch ownership
// check every other payment route relies on. Neither ever accepts a
// payment status from the request; the create-order handler only takes
// contact details for Cashfree's customer_details, and the status
// handler re-fetches truth from Cashfree's own server.

export async function createCashfreeOrder(req: Request, res: Response) {
  const parsed = createCashfreeOrderSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await cashfreePaymentService.createCashfreeOrderForPayment(
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

export async function getCashfreePaymentStatus(req: Request, res: Response) {
  const payment = await cashfreePaymentService.checkCashfreePaymentStatus(
    req.user!.id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: payment,
    message: "Payment status fetched successfully",
  });
}

// GET /api/v1/payments/:id — exposes the existing
// paymentService.getPaymentById (Step 34, unchanged) through an
// authenticated route. Scoped strictly to req.user!.id, same as every
// other handler in this file — a payment belonging to another user 404s
// identically to a nonexistent one (see getPaymentById's doc comment in
// payment.service.ts), so this can never be used to enumerate or read
// another user's payment (IDOR-safe). The PAYMENT_SELECT projection
// payment.service.ts already applies means this never leaks a Cashfree
// secret/credential — none is ever stored on the Payment model.
export async function getPaymentById(req: Request, res: Response) {
  const payment = await paymentService.getPaymentById(req.user!.id, req.params.id);

  res.status(200).json({
    success: true,
    data: payment,
    message: "Payment fetched successfully",
  });
}

// --- Refunds/Cancellation Handling (Step 41) ---
// Both handlers below scope strictly to req.user!.id via
// cashfreePaymentService, mirroring the Cashfree order/status handlers
// above exactly. Neither ever accepts a refund amount or a
// success/failure flag from the request — initiateRefund only takes an
// optional free-text `reason`, and the status handler re-fetches truth
// from Cashfree's own server.

export async function initiateRefund(req: Request, res: Response) {
  const parsed = initiateRefundSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const payment = await cashfreePaymentService.initiateRefund(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: payment,
    message: "Refund initiated successfully",
  });
}

export async function getRefundStatus(req: Request, res: Response) {
  const payment = await cashfreePaymentService.checkCashfreeRefundStatus(
    req.user!.id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: payment,
    message: "Refund status fetched successfully",
  });
}

// Cashfree webhook — intentionally NOT behind requireAuth (see
// paymentWebhook.routes.ts): Cashfree's servers call this directly and
// cannot supply this app's JWT. Authenticity instead comes entirely from
// the HMAC signature check inside cashfreePaymentService.handleCashfreeWebhook.
// Always responds 200 on anything short of a bad signature/payload, so
// Cashfree does not endlessly retry an event this app has already
// processed (or intentionally ignores, e.g. a non-payment event type).
export async function handleCashfreeWebhook(req: Request, res: Response) {
  const timestamp = req.header("x-webhook-timestamp") ?? "";
  const signature = req.header("x-webhook-signature") ?? "";

  if (!req.rawBody) {
    // Should be unreachable in practice (app.ts always captures rawBody
    // for this path) — fails closed rather than falling back to
    // re-serialized JSON, which would break signature verification.
    throw new AppError("Unable to verify webhook: raw body unavailable", 400);
  }

  await cashfreePaymentService.handleCashfreeWebhook(req.rawBody, timestamp, signature);

  res.status(200).json({ success: true, message: "Webhook processed" });
}
