import { Prisma, Role, VerificationStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import {
  DOCUMENT_TYPES_BY_ROLE,
  ListDocumentsQuery,
  UploadDocumentInput,
} from "../validators/document.validator";

const UNSUPPORTED_TYPE_MESSAGE = (role: Role) =>
  `This document type is not applicable for your role (${role})`;
const ALREADY_PENDING_MESSAGE =
  "You already have a document of this type awaiting review";
const ALREADY_APPROVED_MESSAGE =
  "You already have an approved document of this type";

// Shared response shape — enough for the owning user to see what they
// submitted and where it stands, mirrors *_SELECT constants elsewhere in
// this codebase (e.g. RATING_SELECT in rating.service.ts).
const DOCUMENT_SELECT = {
  id: true,
  userId: true,
  documentType: true,
  documentUrl: true,
  status: true,
  rejectionReason: true,
  uploadedAt: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserDocumentSelect;

export type DocumentResult = Prisma.UserDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Registers a new KYC document for the calling user. Validates that the
 * submitted documentType is applicable to the user's role (a FARMER can't
 * submit a TRACTOR_RC, for example), and blocks resubmitting a type that
 * already has a PENDING or APPROVED document on file — a REJECTED
 * document can always be resubmitted, which is how a user corrects a
 * rejected upload.
 */
export async function uploadDocument(
  userId: string,
  role: Role,
  input: UploadDocumentInput
): Promise<DocumentResult> {
  const allowedTypes = DOCUMENT_TYPES_BY_ROLE[role];

  if (!allowedTypes || !allowedTypes.includes(input.documentType)) {
    throw new AppError(UNSUPPORTED_TYPE_MESSAGE(role), 400);
  }

  const existing = await prisma.userDocument.findFirst({
    where: { userId, documentType: input.documentType, status: { not: VerificationStatus.REJECTED } },
    select: { id: true, status: true },
  });

  if (existing) {
    throw new AppError(
      existing.status === VerificationStatus.APPROVED
        ? ALREADY_APPROVED_MESSAGE
        : ALREADY_PENDING_MESSAGE,
      409
    );
  }

  return prisma.userDocument.create({
    data: {
      userId,
      documentType: input.documentType,
      documentUrl: input.documentUrl,
    },
    select: DOCUMENT_SELECT,
  });
}

/**
 * Lists the calling user's own documents, most recently uploaded first.
 * Scoped to `userId` unconditionally — there is no path in this service
 * for a caller to list another user's documents (that's an admin-only
 * concern for a future step).
 */
export async function listOwnDocuments(
  userId: string,
  query: ListDocumentsQuery
): Promise<PaginatedResult<DocumentResult>> {
  const { documentType, page, limit } = query;
  const where: Prisma.UserDocumentWhereInput = {
    userId,
    ...(documentType ? { documentType } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.userDocument.findMany({
      where,
      select: DOCUMENT_SELECT,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userDocument.count({ where }),
  ]);

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
