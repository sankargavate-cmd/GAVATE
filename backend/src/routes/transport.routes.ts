import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createProfile,
  getProfile,
  getTransportAvailability,
  getTransportById,
  nearbyTransportProviders,
  searchTransportProviders,
  updateAvailability,
  updateProfile,
} from "../controllers/transport.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors tractor.routes.ts).
router.use(requireAuth);

// Transport-provider-only: manage own marketplace listing.
router.post("/profile", requireRole(Role.TRANSPORT_PROVIDER), asyncHandler(createProfile));
router.get("/profile", requireRole(Role.TRANSPORT_PROVIDER), asyncHandler(getProfile));
router.put("/profile", requireRole(Role.TRANSPORT_PROVIDER), asyncHandler(updateProfile));
router.patch(
  "/profile/availability",
  requireRole(Role.TRANSPORT_PROVIDER),
  asyncHandler(updateAvailability)
);

// Farmer-only: browse verified, available transport providers.
// NOTE: /search and /nearby must stay registered before /:id (and
// /:id/availability after /:id) or Express will match "search"/"nearby"
// as an :id param instead.
router.get("/search", requireRole(Role.FARMER), asyncHandler(searchTransportProviders));
router.get("/nearby", requireRole(Role.FARMER), asyncHandler(nearbyTransportProviders));
router.get(
  "/:id/availability",
  requireRole(Role.FARMER),
  asyncHandler(getTransportAvailability)
);
router.get("/:id", requireRole(Role.FARMER), asyncHandler(getTransportById));

export default router;
