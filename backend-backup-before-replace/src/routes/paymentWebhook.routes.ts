import { Router } from "express";
import { handleCashfreeWebhook } from "../controllers/payment.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Intentionally no requireAuth here (see payment.routes.ts) — Cashfree's
// servers call this endpoint directly and cannot supply a JWT.
// Authenticity is instead verified inside the controller/service via the
// Cashfree HMAC webhook signature (x-webhook-signature/x-webhook-timestamp
// headers), not this app's own auth middleware.
router.post("/webhook", asyncHandler(handleCashfreeWebhook));

export default router;
