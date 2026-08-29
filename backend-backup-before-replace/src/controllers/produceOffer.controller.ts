import { Role } from "@prisma/client";
import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as produceOfferService from "../services/produceOffer.service";
import {
  createProduceOfferSchema,
  listProduceOffersQuerySchema,
  respondProduceOfferSchema,
} from "../validators/produceOffer.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// produceOffer.routes.ts), so req.user is guaranteed to be populated here.

export async function createOffer(req: Request, res: Response) {
  const parsed = createProduceOfferSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const offer = await produceOfferService.createProduceOffer(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: offer,
    message: "Offer sent successfully",
  });
}

/**
 * Lists the caller's own produce offers — which side of the relationship
 * ("sent" vs "received") depends on their role, since both a buyer and a
 * farmer hit the same GET / route.
 */
export async function listMyOffers(req: Request, res: Response) {
  const parsed = listProduceOffersQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result =
    req.user!.role === Role.BUYER
      ? await produceOfferService.listSentProduceOffers(req.user!.id, parsed.data)
      : await produceOfferService.listReceivedProduceOffers(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Produce offers fetched successfully",
  });
}

export async function getOfferById(req: Request, res: Response) {
  const offer = await produceOfferService.getOwnProduceOfferById(
    req.user!.id,
    req.user!.role,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: offer,
    message: "Produce offer fetched successfully",
  });
}

export async function withdrawOffer(req: Request, res: Response) {
  const offer = await produceOfferService.withdrawProduceOffer(
    req.user!.id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: offer,
    message: "Offer withdrawn successfully",
  });
}

export async function respondToOffer(req: Request, res: Response) {
  const parsed = respondProduceOfferSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const offer = await produceOfferService.respondToProduceOffer(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: offer,
    message:
      parsed.data.action === "ACCEPT"
        ? "Offer accepted successfully"
        : "Offer rejected successfully",
  });
}
