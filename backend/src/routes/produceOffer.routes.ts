import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createOffer,
  getOfferById,
  listMyOffers,
  respondToOffer,
  withdrawOffer,
} from "../controllers/produceOffer.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors transportBooking.routes.ts).
router.use(requireAuth);

// Buyer-only: send and manage offers they've made.
router.post("/", requireRole(Role.BUYER), asyncHandler(createOffer));
router.patch("/:id/withdraw", requireRole(Role.BUYER), asyncHandler(withdrawOffer));

// Farmer-only: respond to an offer received on one of their listings.
router.patch("/:id/respond", requireRole(Role.FARMER), asyncHandler(respondToOffer));

// Shared: both a buyer (their sent offers) and a farmer (their received
// offers) list/view through the same routes — the controller dispatches
// on req.user.role to decide which side to query.
// NOTE: this GET / must stay registered separately from GET /:id, which
// Express already keeps distinct since "" and ":id" can't collide here.
router.get("/", requireRole(Role.BUYER, Role.FARMER), asyncHandler(listMyOffers));
router.get("/:id", requireRole(Role.BUYER, Role.FARMER), asyncHandler(getOfferById));

export default router;
