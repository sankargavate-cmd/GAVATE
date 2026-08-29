import { Request, Response } from "express";
import * as buyerVerificationService from "../services/buyerVerification.service";

// requireAuth + requireRole(Role.BUYER) always run before this handler
// (see buyerVerification.routes.ts), so req.user is guaranteed to be an
// authenticated buyer here.

export async function getMyVerificationStatus(req: Request, res: Response) {
  const status = await buyerVerificationService.getBuyerVerificationStatus(req.user!.id);

  res.status(200).json({
    success: true,
    data: status,
    message: "Buyer verification status fetched successfully",
  });
}
