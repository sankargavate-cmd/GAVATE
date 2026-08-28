import { Role } from "@prisma/client";
import { Router } from "express";
import { getMyVerificationStatus } from "../controllers/transportVerification.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Transport-provider-only: a transport provider can only ever check
// their own verification status. Mirrors tractorVerification.routes.ts.
router.use(requireAuth, requireRole(Role.TRANSPORT_PROVIDER));

router.get("/verification-status", asyncHandler(getMyVerificationStatus));

export default router;
