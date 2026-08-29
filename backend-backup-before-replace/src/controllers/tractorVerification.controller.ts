import { Request, Response } from "express";
import * as tractorVerificationService from "../services/tractorVerification.service";

// requireAuth + requireRole(Role.TRACTOR_OWNER) always run before this
// handler (see tractorVerification.routes.ts), so req.user is guaranteed
// to be an authenticated tractor owner here.

export async function getMyVerificationStatus(req: Request, res: Response) {
  const status = await tractorVerificationService.getTractorOwnerVerificationStatus(
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: status,
    message: "Tractor owner verification status fetched successfully",
  });
}
