import { Role } from "@prisma/client";
import { Router } from "express";
import {
  advanceOrder,
  cancelOrder,
  getOrderById,
  getOrderHistory,
  initiateOrderPayment,
  listMyOrders,
} from "../controllers/order.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; both a BUYER and a FARMER
// are allowed on all of them (the service layer decides which side of an
// order the caller can see/act on), mirrors produceOffer.routes.ts.
router.use(requireAuth);
router.use(requireRole(Role.BUYER, Role.FARMER));

// Orders are never created directly through this router — they're created
// automatically when a farmer accepts a produce offer (see
// produceOffer.service.ts:respondToProduceOffer / order.service.ts:
// createOrderFromAcceptedOffer). There is deliberately no POST / here.
router.get("/", asyncHandler(listMyOrders));
router.get("/:id", asyncHandler(getOrderById));
router.get("/:id/history", asyncHandler(getOrderHistory));
router.patch("/:id/advance", asyncHandler(advanceOrder));
router.patch("/:id/cancel", asyncHandler(cancelOrder));
// Marketplace/Produce Order payment (Step 39) — initiates/reuses a
// Cashfree order for this order's Payment record. Buyer-only: narrows
// past the router-level requireRole(BUYER, FARMER) above, since only the
// buyer who placed the order ever pays for it. Ownership + amount are
// both enforced server-side in orderPayment.service.ts.
router.post("/:id/pay", requireRole(Role.BUYER), asyncHandler(initiateOrderPayment));

export default router;
