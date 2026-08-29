import { Role } from "@prisma/client";
import { Router } from "express";
import { getMyVerificationStatus } from "../controllers/buyerVerification.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Buyer-only: a buyer can only ever check their own verification status.
router.use(requireAuth, requireRole(Role.BUYER));

router.get("/verification-status", asyncHandler(getMyVerificationStatus));

export default router;
