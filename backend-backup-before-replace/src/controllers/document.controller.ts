import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as documentService from "../services/document.service";
import { listDocumentsQuerySchema, uploadDocumentSchema } from "../validators/document.validator";

// requireAuth always runs before these handlers (see document.routes.ts),
// so req.user is guaranteed to be populated here.

export async function uploadDocument(req: Request, res: Response) {
  const parsed = uploadDocumentSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const document = await documentService.uploadDocument(req.user!.id, req.user!.role, parsed.data);

  res.status(201).json({
    success: true,
    data: document,
    message: "Document submitted successfully",
  });
}

export async function listOwnDocuments(req: Request, res: Response) {
  const parsed = listDocumentsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await documentService.listOwnDocuments(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Documents fetched successfully",
  });
}
