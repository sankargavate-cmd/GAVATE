import { Router } from "express";
import { getMyLocation, updateMyLocation } from "../controllers/location.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Every route here requires a logged-in user, but no specific role — the
// User-level location fields (Step 30) are available to every
// authenticated role (including BUYER, which has no profile table of its
// own), unlike the role-scoped routers elsewhere in this codebase
// (farmer.routes.ts, tractor.routes.ts, ...).
router.use(requireAuth);

router.get("/", asyncHandler(getMyLocation));
router.put("/", asyncHandler(updateMyLocation));

export default router;
