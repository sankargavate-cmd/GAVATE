import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createProfile,
  getProfile,
  getTractorAvailability,
  getTractorById,
  nearbyTractors,
  searchTractors,
  updateAvailability,
  updateProfile,
} from "../controllers/tractor.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors labour.routes.ts).
router.use(requireAuth);

// Tractor-owner-only: manage own marketplace listing.
router.post("/profile", requireRole(Role.TRACTOR_OWNER), asyncHandler(createProfile));
router.get("/profile", requireRole(Role.TRACTOR_OWNER), asyncHandler(getProfile));
router.put("/profile", requireRole(Role.TRACTOR_OWNER), asyncHandler(updateProfile));
router.patch(
  "/profile/availability",
  requireRole(Role.TRACTOR_OWNER),
  asyncHandler(updateAvailability)
);

// Farmer-only: browse verified, available tractors.
// NOTE: /search and /nearby must stay registered before /:id (and
// /:id/availability after /:id) or Express will match "search"/"nearby"
// as an :id param instead.
router.get("/search", requireRole(Role.FARMER), asyncHandler(searchTractors));
router.get("/nearby", requireRole(Role.FARMER), asyncHandler(nearbyTractors));
router.get("/:id/availability", requireRole(Role.FARMER), asyncHandler(getTractorAvailability));
router.get("/:id", requireRole(Role.FARMER), asyncHandler(getTractorById));

export default router;
