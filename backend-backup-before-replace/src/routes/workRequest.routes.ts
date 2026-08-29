import { Role } from "@prisma/client";
import { Router } from "express";
import {
  cancelWorkRequest,
  createWorkRequest,
  getWorkRequestById,
  initiateWorkRequestPayment,
  listMyWorkRequests,
  respondToWorkRequest,
} from "../controllers/workRequest.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors labour.routes.ts / produce.routes.ts).
router.use(requireAuth);

// Farmer-only: send and manage requests they've sent.
router.post("/", requireRole(Role.FARMER), asyncHandler(createWorkRequest));
router.patch("/:id/cancel", requireRole(Role.FARMER), asyncHandler(cancelWorkRequest));
// Labour service payment (Step 36) — initiates/reuses a Cashfree order
// for this work request's Payment record. Ownership + amount are both
// enforced server-side in workRequestPayment.service.ts.
router.post("/:id/pay", requireRole(Role.FARMER), asyncHandler(initiateWorkRequestPayment));

// Labour-only: respond to a request they've received.
router.patch("/:id/respond", requireRole(Role.LABOUR), asyncHandler(respondToWorkRequest));

// Shared: both a farmer (their sent requests) and a labour user (their
// received requests) list/view through the same routes — the controller
// dispatches on req.user.role to decide which side to query.
// NOTE: this GET / must stay registered separately from GET /:id, which
// Express already keeps distinct since "" and ":id" can't collide here.
router.get("/", requireRole(Role.FARMER, Role.LABOUR), asyncHandler(listMyWorkRequests));
router.get("/:id", requireRole(Role.FARMER, Role.LABOUR), asyncHandler(getWorkRequestById));

export default router;
