import { Role } from "@prisma/client";
import { Router } from "express";
import {
  createProfile,
  getProfile,
  updateProfile,
} from "../controllers/farmer.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here is farmer-only: authenticate first, then restrict by role.
router.use(requireAuth, requireRole(Role.FARMER));

router.post("/profile", asyncHandler(createProfile));
router.get("/profile", asyncHandler(getProfile));
router.put("/profile", asyncHandler(updateProfile));

export default router;
