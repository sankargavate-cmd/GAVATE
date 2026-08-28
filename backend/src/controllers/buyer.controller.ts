import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as buyerService from "../services/buyer.service";
import { nearbyBuyerQuerySchema } from "../validators/buyer.validator";

// requireAuth + requireRole(Role.FARMER) always run before this handler
// (see buyer.routes.ts), so req.user is guaranteed to be an authenticated
// farmer here.

export async function nearbyBuyers(req: Request, res: Response) {
  const parsed = nearbyBuyerQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const { latitude, longitude, radiusKm } = parsed.data;
  const results = await buyerService.findNearbyVerifiedBuyers(
    { latitude, longitude },
    radiusKm,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: results.map(({ item, distanceKm }) => ({ ...item, distanceKm })),
    message: "Nearby buyers fetched successfully",
  });
}
