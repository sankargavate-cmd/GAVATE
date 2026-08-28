import { Router } from "express";
import {
  forgotPassword,
  login,
  resendVerification,
  resetPassword,
  signup,
  verifyEmail,
} from "../controllers/auth.controller";
import { authRateLimit } from "../middlewares/rateLimiter";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// These three endpoints previously had no throttling at all — login is a
// direct password-guessing target, signup enables mass fake-account
// creation, and forgot-password can be used to spam a victim's inbox.
// resend-verification already enforces its own per-account cooldown
// (auth.service.ts) and reset-password's token is 256-bit random, so
// guessing it isn't rate-limit-shaped; both are left as-is.
router.post("/signup", authRateLimit(10, 15 * 60 * 1000), asyncHandler(signup));
router.post("/login", authRateLimit(10, 15 * 60 * 1000), asyncHandler(login));
router.post("/verify-email", asyncHandler(verifyEmail));
router.post("/resend-verification", asyncHandler(resendVerification));
router.post(
  "/forgot-password",
  authRateLimit(5, 15 * 60 * 1000),
  asyncHandler(forgotPassword)
);
router.post("/reset-password", asyncHandler(resetPassword));

export default router;
