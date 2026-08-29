import { Role } from "@prisma/client";
import { Router } from "express";
import { approve, getById, listPending, reject } from "../controllers/adminDocument.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here is admin-only. Mirrors adminLabour.routes.ts /
// adminFarmer.routes.ts exactly.
router.use(requireAuth, requireRole(Role.ADMIN));

router.get("/pending", asyncHandler(listPending));
router.get("/:id", asyncHandler(getById));
router.patch("/:id/approve", asyncHandler(approve));
router.patch("/:id/reject", asyncHandler(reject));

export default router;
