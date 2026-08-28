import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createRating,
  deleteRating,
  getRatingById,
  getUserRatingSummary,
  listGivenRatings,
  listReceivedRatings,
  updateRating,
} from "../controllers/rating.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user; the specific role allowed
// differs per route below, so requireRole is applied per-route rather than
// once for the whole router (mirrors transportBooking.routes.ts).
router.use(requireAuth);

// Farmer-only: the rater is always a FARMER in this app (the only role
// that engages Labour, Tractor, Transport, and Buyer), so create/edit/
// delete of a rating is restricted to that role.
router.post("/", requireRole(Role.FARMER), asyncHandler(createRating));
router.get("/given", requireRole(Role.FARMER), asyncHandler(listGivenRatings));

// Ratee-only: any of the four roles a farmer can rate may list the
// ratings they've received.
router.get(
  "/received",
  requireRole(Role.LABOUR, Role.TRACTOR_OWNER, Role.TRANSPORT_PROVIDER, Role.BUYER),
  asyncHandler(listReceivedRatings)
);

// Shared/public (any authenticated role): rating summary + reviews for a
// specific ratee, e.g. what a farmer sees on a Labour/Tractor/Transport
// detail page. NOTE: must stay registered before "/:id" or Express would
// match "user" as an :id param instead.
router.get("/user/:userId", asyncHandler(getUserRatingSummary));

// Shared: fetch a single rating the caller is party to (rater or ratee).
router.get("/:id", asyncHandler(getRatingById));

// Farmer-only: edit/delete a rating they left.
router.put("/:id", requireRole(Role.FARMER), asyncHandler(updateRating));
router.delete("/:id", requireRole(Role.FARMER), asyncHandler(deleteRating));

export default router;
