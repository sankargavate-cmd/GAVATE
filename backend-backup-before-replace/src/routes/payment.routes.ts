import { Router } from "express";
import {
  createCashfreeOrder,
  getCashfreePaymentStatus,
  getMyPayments,
  getPaymentById,
  getRefundStatus,
  initiateRefund,
} from "../controllers/payment.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user, but is not restricted to
// any particular role — any authenticated user (Farmer, Labour, Tractor
// Owner, Transport Provider, Buyer) can make a payment, mirroring
// notification.routes.ts. The Cashfree webhook (Step 35) is
// deliberately NOT in this router — see paymentWebhook.routes.ts — since
// Cashfree's server cannot supply a user JWT.
router.use(requireAuth);

router.get("/me", asyncHandler(getMyPayments));

// Cashfree Payment Gateway integration (Step 35).
router.post("/:id/cashfree/order", asyncHandler(createCashfreeOrder));
router.get("/:id/cashfree/status", asyncHandler(getCashfreePaymentStatus));

// Step 41: Refunds/Cancellation Handling. Registered before the broader
// /:id below for the same reason the cashfree/* routes above are —
// Express matches these more specific paths first. Neither route takes
// a refund amount/status from the client (see payment.controller.ts);
// eligibility (payment SUCCESS + related entity CANCELLED) and the
// refund amount itself are both enforced/sourced entirely server-side.
router.post("/:id/refund", asyncHandler(initiateRefund));
router.get("/:id/refund/status", asyncHandler(getRefundStatus));

// Step 40: single-payment lookup by id, scoped to the caller's own
// payments via paymentService.getPaymentById. Registered after the more
// specific /me, /:id/cashfree/* and /:id/refund* routes above so those
// continue to match first; Express only falls through to this broader
// /:id pattern for a bare GET /api/v1/payments/<id>.
router.get("/:id", asyncHandler(getPaymentById));

export default router;
