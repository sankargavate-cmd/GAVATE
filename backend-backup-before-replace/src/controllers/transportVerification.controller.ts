import { Request, Response } from "express";
import * as transportVerificationService from "../services/transportVerification.service";

// requireAuth + requireRole(Role.TRANSPORT_PROVIDER) always run before
// this handler (see transportVerification.routes.ts), so req.user is
// guaranteed to be an authenticated transport provider here.

export async function getMyVerificationStatus(req: Request, res: Response) {
  const status = await transportVerificationService.getTransportProviderVerificationStatus(
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: status,
    message: "Transport provider verification status fetched successfully",
  });
}
