import { Role } from "@prisma/client";
import { Router } from "express";
import {
  getPaymentById,
  listPayments,
  reconcilePayment,
} from "../controllers/adminPayment.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here is admin-only. Mirrors adminFarmer.routes.ts /
// adminLabour.routes.ts / adminDocument.routes.ts exactly.
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/", asyncHandler(listPayments));
// Registered before the broader /:id below so Express matches this more
// specific path first — mirrors payment.routes.ts's own /:id/cashfree/*
// and /:id/refund* ordering.
router.post("/:id/reconcile", asyncHandler(reconcilePayment));
router.get("/:id", asyncHandler(getPaymentById));

export default router;
