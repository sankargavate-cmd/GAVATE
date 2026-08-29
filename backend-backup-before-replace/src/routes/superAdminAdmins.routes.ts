import { Role } from "@prisma/client";
import { Router } from "express";
import {
  activateAdmin,
  assignPermissions,
  createAdmin,
  deactivateAdmin,
  getAdmin,
  listAdmins,
  removeAdminAccess,
  resetAdminPassword,
} from "../controllers/adminManagement.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here is SUPER_ADMIN-only. A normal ADMIN (even with every
// permission in ADMIN_PERMISSIONS) is rejected by requireRole here — admin
// management is gated by role alone, never by a grantable permission.
router.use(requireAuth, requireRole(Role.SUPER_ADMIN));

router.post("/", asyncHandler(createAdmin));
router.get("/", asyncHandler(listAdmins));
router.get("/:id", asyncHandler(getAdmin));
router.patch("/:id/activate", asyncHandler(activateAdmin));
router.patch("/:id/deactivate", asyncHandler(deactivateAdmin));
router.delete("/:id", asyncHandler(removeAdminAccess));
router.patch("/:id/reset-password", asyncHandler(resetAdminPassword));
router.patch("/:id/permissions", asyncHandler(assignPermissions));

export default router;
