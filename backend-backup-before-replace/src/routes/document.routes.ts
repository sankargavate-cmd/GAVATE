import { Role } from "@prisma/client";
import { Router } from "express";
import { listOwnDocuments, uploadDocument } from "../controllers/document.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user, and is restricted to the
// five KYC-bearing roles (mirrors DOCUMENT_TYPES_BY_ROLE in
// document.validator.ts) — ADMIN/SUPER_ADMIN/MACHINERY_PROVIDER have no
// document workflow yet.
router.use(requireAuth);
router.use(
  requireRole(Role.FARMER, Role.LABOUR, Role.BUYER, Role.TRACTOR_OWNER, Role.TRANSPORT_PROVIDER)
);

router.post("/", asyncHandler(uploadDocument));
router.get("/", asyncHandler(listOwnDocuments));

export default router;
