import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as adminDocumentService from "../services/adminDocument.service";
import {
  documentIdParamSchema,
  listPendingDocumentsQuerySchema,
  rejectDocumentSchema,
} from "../validators/adminDocument.validator";

// requireAuth + requireRole(Role.ADMIN) always run before these handlers
// (see adminDocument.routes.ts), so req.user is guaranteed to be an
// authenticated admin here.

export async function listPending(req: Request, res: Response) {
  const parsed = listPendingDocumentsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await adminDocumentService.listPendingDocuments(parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    message: "Pending documents fetched successfully",
  });
}

export async function getById(req: Request, res: Response) {
  const parsedParams = documentIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const document = await adminDocumentService.getDocumentById(parsedParams.data.id);

  res.status(200).json({
    success: true,
    data: document,
    message: "Document fetched successfully",
  });
}

export async function approve(req: Request, res: Response) {
  const parsedParams = documentIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const document = await adminDocumentService.approveDocument(
    parsedParams.data.id,
    req.user!.id
  );

  res.status(200).json({
    success: true,
    data: document,
    message: "Document approved successfully",
  });
}

export async function reject(req: Request, res: Response) {
  const parsedParams = documentIdParamSchema.safeParse(req.params);

  if (!parsedParams.success) {
    throw new AppError("Validation failed", 400, parsedParams.error.flatten().fieldErrors);
  }

  const parsedBody = rejectDocumentSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError("Validation failed", 400, parsedBody.error.flatten().fieldErrors);
  }

  const document = await adminDocumentService.rejectDocument(
    parsedParams.data.id,
    req.user!.id,
    parsedBody.data
  );

  res.status(200).json({
    success: true,
    data: document,
    message: "Document rejected successfully",
  });
}
