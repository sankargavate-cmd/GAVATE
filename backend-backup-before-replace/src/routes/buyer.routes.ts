import { Role } from "@prisma/client";
import { Router } from "express";
import { nearbyBuyers } from "../controllers/buyer.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// is applied per-route (mirrors labour.routes.ts/tractor.routes.ts). This
// router is mounted at the same "/buyers" prefix as
// buyerVerification.routes.ts (see routes/index.ts) but owns a disjoint
// path ("/nearby" here vs "/verification-status" there, which stays
// buyer-only and untouched), so the two coexist without any change to
// the existing buyer-verification router or its behavior.
router.use(requireAuth);

// Farmer-only: browse nearby, fully KYC-verified buyers.
router.get("/nearby", requireRole(Role.FARMER), asyncHandler(nearbyBuyers));

export default router;
