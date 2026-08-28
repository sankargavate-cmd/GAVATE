import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as produceService from "../services/produce.service";
import {
  createProduceListingSchema,
  listOwnProduceQuerySchema,
  searchProduceQuerySchema,
  updateProduceListingSchema,
} from "../validators/produce.validator";

// requireAuth (+ requireRole) always runs before these handlers (see
// produce.routes.ts), so req.user is guaranteed to be populated here.

export async function createListing(req: Request, res: Response) {
  const parsed = createProduceListingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const listing = await produceService.createProduceListing(req.user!.id, parsed.data);

  res.status(201).json({
    success: true,
    data: listing,
    message: "Produce listing created successfully",
  });
}

export async function listOwnListings(req: Request, res: Response) {
  const parsed = listOwnProduceQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await produceService.listOwnProduceListings(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Produce listings fetched successfully",
  });
}

export async function getOwnListingById(req: Request, res: Response) {
  const listing = await produceService.getOwnProduceListingById(
    req.user!.id,
    req.params.id
  );

  res.status(200).json({
    success: true,
    data: listing,
    message: "Produce listing fetched successfully",
  });
}

export async function updateListing(req: Request, res: Response) {
  const parsed = updateProduceListingSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const listing = await produceService.updateProduceListing(
    req.user!.id,
    req.params.id,
    parsed.data
  );

  res.status(200).json({
    success: true,
    data: listing,
    message: "Produce listing updated successfully",
  });
}

export async function deleteListing(req: Request, res: Response) {
  await produceService.deleteProduceListing(req.user!.id, req.params.id);

  res.status(200).json({
    success: true,
    data: null,
    message: "Produce listing deleted successfully",
  });
}

export async function searchListings(req: Request, res: Response) {
  const parsed = searchProduceQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await produceService.searchVerifiedProduceListings(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Produce listings fetched successfully",
  });
}

export async function getListingById(req: Request, res: Response) {
  const listing = await produceService.getVerifiedProduceListingById(req.params.id);

  res.status(200).json({
    success: true,
    data: listing,
    message: "Produce listing fetched successfully",
  });
}
