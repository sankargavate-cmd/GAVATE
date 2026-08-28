import { Role } from "@prisma/client";
import { Router } from "express";
import {
  cancelTractorBooking,
  createTractorBooking,
  getTractorBookingById,
  initiateTractorBookingPayment,
  listMyTractorBookings,
  respondToTractorBooking,
} from "../controllers/tractorBooking.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors workRequest.routes.ts).
router.use(requireAuth);

// Farmer-only: send and manage bookings they've sent.
router.post("/", requireRole(Role.FARMER), asyncHandler(createTractorBooking));
router.patch("/:id/cancel", requireRole(Role.FARMER), asyncHandler(cancelTractorBooking));
// Tractor booking payment (Step 37) — initiates/reuses a Cashfree order
// for this booking's Payment record. Ownership + amount are both
// enforced server-side in tractorBookingPayment.service.ts.
router.post(
  "/:id/pay",
  requireRole(Role.FARMER),
  asyncHandler(initiateTractorBookingPayment)
);

// Tractor-owner-only: respond to a booking they've received.
router.patch(
  "/:id/respond",
  requireRole(Role.TRACTOR_OWNER),
  asyncHandler(respondToTractorBooking)
);

// Shared: both a farmer (their sent bookings) and a tractor owner (their
// received bookings) list/view through the same routes — the controller
// dispatches on req.user.role to decide which side to query.
// NOTE: this GET / must stay registered separately from GET /:id, which
// Express already keeps distinct since "" and ":id" can't collide here.
router.get(
  "/",
  requireRole(Role.FARMER, Role.TRACTOR_OWNER),
  asyncHandler(listMyTractorBookings)
);
router.get(
  "/:id",
  requireRole(Role.FARMER, Role.TRACTOR_OWNER),
  asyncHandler(getTractorBookingById)
);

export default router;
