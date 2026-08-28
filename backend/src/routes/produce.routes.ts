import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createListing,
  deleteListing,
  getListingById,
  getOwnListingById,
  listOwnListings,
  searchListings,
  updateListing,
} from "../controllers/produce.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors labour.routes.ts).
router.use(requireAuth);

// Farmer-only: manage own produce listings.
// NOTE: /listings and /search must stay registered before /:id, or Express
// will match "listings"/"search" as an :id param instead.
router.post("/listings", requireRole(Role.FARMER), asyncHandler(createListing));
router.get("/listings", requireRole(Role.FARMER), asyncHandler(listOwnListings));
router.get("/listings/:id", requireRole(Role.FARMER), asyncHandler(getOwnListingById));
router.put("/listings/:id", requireRole(Role.FARMER), asyncHandler(updateListing));
router.delete("/listings/:id", requireRole(Role.FARMER), asyncHandler(deleteListing));

// Buyer-only: browse verified, active produce listings.
router.get("/search", requireRole(Role.BUYER), asyncHandler(searchListings));
router.get("/:id", requireRole(Role.BUYER), asyncHandler(getListingById));

export default router;
