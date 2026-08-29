import { Router } from "express";
import {
  getMyNotifications,
  markAllAsRead,
  markAsRead,
} from "../controllers/notification.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user, but is not restricted to
// any particular role — notifications apply uniformly across all roles
// (Farmer, Labour, Tractor Owner, Transport Provider, Buyer, Admin,
// Super Admin), unlike most other route groups in this codebase.
router.use(requireAuth);

router.get("/", asyncHandler(getMyNotifications));
router.patch("/read-all", asyncHandler(markAllAsRead));
router.patch("/:id/read", asyncHandler(markAsRead));

export default router;
