import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createProfile,
  getLabourById,
  getProfile,
  nearbyLabour,
  searchLabour,
  updateAvailability,
  updateProfile,
} from "../controllers/labour.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (unlike farmer.routes.ts, which is single-role).
router.use(requireAuth);

// Labour-only: manage own marketplace listing.
router.post("/profile", requireRole(Role.LABOUR), asyncHandler(createProfile));
router.get("/profile", requireRole(Role.LABOUR), asyncHandler(getProfile));
router.put("/profile", requireRole(Role.LABOUR), asyncHandler(updateProfile));
router.patch(
  "/profile/availability",
  requireRole(Role.LABOUR),
  asyncHandler(updateAvailability)
);

// Farmer-only: browse verified, available labour.
// NOTE: /search and /nearby must stay registered before /:id or Express
// will match "search"/"nearby" as an :id param instead.
router.get("/search", requireRole(Role.FARMER), asyncHandler(searchLabour));
router.get("/nearby", requireRole(Role.FARMER), asyncHandler(nearbyLabour));
router.get("/:id", requireRole(Role.FARMER), asyncHandler(getLabourById));

export default router;
