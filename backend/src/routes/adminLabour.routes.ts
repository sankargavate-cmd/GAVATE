import { Role } from "@prisma/client";
import { Router } from "express";
import { approve, listPending, reject } from "../controllers/adminLabour.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here is admin-only.
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/pending", asyncHandler(listPending));
router.patch("/:id/approve", asyncHandler(approve));
router.patch("/:id/reject", asyncHandler(reject));

export default router;
