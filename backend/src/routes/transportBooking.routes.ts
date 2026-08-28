import { Role } from "@prisma/client";
import { Router } from "express";
import {
  cancelTransportBooking,
  createTransportBooking,
  getTransportBookingById,
  initiateTransportBookingPayment,
  listMyTransportBookings,
  respondToTransportBooking,
} from "../controllers/transportBooking.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors tractorBooking.routes.ts).
router.use(requireAuth);

// Farmer-only: send and manage bookings they've sent.
router.post("/", requireRole(Role.FARMER), asyncHandler(createTransportBooking));
router.patch("/:id/cancel", requireRole(Role.FARMER), asyncHandler(cancelTransportBooking));
// Transport booking payment (Step 38) — initiates/reuses a Cashfree
// order for this booking's Payment record. Ownership + amount are both
// enforced server-side in transportBookingPayment.service.ts.
router.post(
  "/:id/pay",
  requireRole(Role.FARMER),
  asyncHandler(initiateTransportBookingPayment)
);

// Transport-provider-only: respond to a booking they've received.
router.patch(
  "/:id/respond",
  requireRole(Role.TRANSPORT_PROVIDER),
  asyncHandler(respondToTransportBooking)
);

// Shared: both a farmer (their sent bookings) and a transport provider
// (their received bookings) list/view through the same routes — the
// controller dispatches on req.user.role to decide which side to query.
// NOTE: this GET / must stay registered separately from GET /:id, which
// Express already keeps distinct since "" and ":id" can't collide here.
router.get(
  "/",
  requireRole(Role.FARMER, Role.TRANSPORT_PROVIDER),
  asyncHandler(listMyTransportBookings)
);
router.get(
  "/:id",
  requireRole(Role.FARMER, Role.TRANSPORT_PROVIDER),
  asyncHandler(getTransportBookingById)
);

export default router;
