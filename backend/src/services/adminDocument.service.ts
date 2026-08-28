import { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { notifySafely } from "./notification.service";
import {
  ListPendingDocumentsQuery,
  RejectDocumentInput,
} from "../validators/adminDocument.validator";
import { PaginatedResult } from "./document.service";

const DOCUMENT_NOT_FOUND_MESSAGE = "Document not found";
const ALREADY_APPROVED_MESSAGE = "Document is already approved";

// Admin-facing shape — includes review metadata and a slice of the
// owning user's account info (name/email/role), neither of which the
// submitting user's own DOCUMENT_SELECT in document.service.ts exposes,
// since that select is scoped to what the submitting user themselves
// needs back. Mirrors ADMIN_LABOUR_PROFILE_SELECT in
// adminLabour.service.ts.
const ADMIN_DOCUMENT_SELECT = {
  id: true,
  userId: true,
  documentType: true,
  documentUrl: true,
  status: true,
  rejectionReason: true,
  uploadedAt: true,
  reviewedAt: true,
  reviewedByAdminId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.UserDocumentSelect;

export type AdminDocumentResult = Prisma.UserDocumentGetPayload<{
  select: typeof ADMIN_DOCUMENT_SELECT;
}>;

/**
 * Lists documents still awaiting admin review (status = PENDING),
 * oldest-first so admins naturally work through the queue in the order
 * documents were submitted. Mirrors listPendingLabourProfiles in
 * adminLabour.service.ts.
 */
export async function listPendingDocuments(
  query: ListPendingDocumentsQuery
): Promise<PaginatedResult<AdminDocumentResult>> {
  const { page, limit } = query;

  const where: Prisma.UserDocumentWhereInput = {
    status: VerificationStatus.PENDING,
  };

  const [items, total] = await prisma.$transaction([
    prisma.userDocument.findMany({
      where,
      select: ADMIN_DOCUMENT_SELECT,
      orderBy: { uploadedAt: "asc" },
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

/**
 * Fetches a single document's full details for admin review, regardless
 * of its current status (not just PENDING) — an admin may want to look
 * back at an already-decided document. 404 if it doesn't exist.
 */
export async function getDocumentById(id: string): Promise<AdminDocumentResult> {
  const document = await prisma.userDocument.findUnique({
    where: { id },
    select: ADMIN_DOCUMENT_SELECT,
  });

  if (!document) {
    throw new AppError(DOCUMENT_NOT_FOUND_MESSAGE, 404);
  }

  return document;
}

/**
 * Approves a document: sets status APPROVED, stamps
 * reviewedAt/reviewedByAdminId, and clears any prior rejectionReason
 * (covers the "previously rejected, now approved" case). 404 if the
 * document doesn't exist; 409 if it's already approved, so a double-click
 * / retry doesn't silently re-stamp the decision. Mirrors
 * approveLabourProfile in adminLabour.service.ts.
 */
export async function approveDocument(
  id: string,
  adminId: string
): Promise<AdminDocumentResult> {
  const existing = await prisma.userDocument.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError(DOCUMENT_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.status === VerificationStatus.APPROVED) {
    throw new AppError(ALREADY_APPROVED_MESSAGE, 409);
  }

  const updated = await prisma.userDocument.update({
    where: { id },
    data: {
      status: VerificationStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
      rejectionReason: null,
    },
    select: ADMIN_DOCUMENT_SELECT,
  });

  // Notify the document owner it was approved.
  await notifySafely({
    recipientId: updated.userId,
    type: "KYC_DOCUMENT",
    title: "Document Approved",
    message: `Your ${updated.documentType} document has been approved.`,
    relatedEntityType: "USER_DOCUMENT",
    relatedEntityId: updated.id,
  });

  return updated;
}

/**
 * Rejects a document with a required reason: sets status REJECTED,
 * stamps reviewedAt/reviewedByAdminId, and records the reason. 404 if the
 * document doesn't exist. Mirrors rejectLabourProfile in
 * adminLabour.service.ts. A REJECTED document can always be resubmitted
 * by the owning user via document.service.ts's uploadDocument.
 */
export async function rejectDocument(
  id: string,
  adminId: string,
  input: RejectDocumentInput
): Promise<AdminDocumentResult> {
  const existing = await prisma.userDocument.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(DOCUMENT_NOT_FOUND_MESSAGE, 404);
  }

  const updated = await prisma.userDocument.update({
    where: { id },
    data: {
      status: VerificationStatus.REJECTED,
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
      rejectionReason: input.reason,
    },
    select: ADMIN_DOCUMENT_SELECT,
  });

  // Notify the document owner it was rejected, including the admin's
  // stated reason so they know what to fix before resubmitting.
  await notifySafely({
    recipientId: updated.userId,
    type: "KYC_DOCUMENT",
    title: "Document Rejected",
    message: `Your ${updated.documentType} document was rejected. Reason: ${updated.rejectionReason}`,
    relatedEntityType: "USER_DOCUMENT",
    relatedEntityId: updated.id,
  });

  return updated;
}
