import { Role } from "@prisma/client";
import { Router } from "express";
import { getMyVerificationStatus } from "../controllers/tractorVerification.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Tractor-owner-only: a tractor owner can only ever check their own
// verification status. Mirrors buyerVerification.routes.ts.
router.use(requireAuth, requireRole(Role.TRACTOR_OWNER));

router.get("/verification-status", asyncHandler(getMyVerificationStatus));

export default router;
