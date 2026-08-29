import { DocumentType, VerificationStatus } from "@prisma/client";
import { REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES } from "../constants/tractorVerification";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";

const NOT_VERIFIED_MESSAGE =
  "This tractor owner is not verified yet. All required KYC documents must be approved before tractor bookings can be created or accepted.";

export interface TractorOwnerVerificationStatus {
  isVerified: boolean;
  requiredDocumentTypes: DocumentType[];
  approvedDocumentTypes: DocumentType[];
  pendingDocumentTypes: DocumentType[];
  rejectedDocumentTypes: DocumentType[];
  missingDocumentTypes: DocumentType[];
}

/**
 * Computes a tractor owner's verification status live from their
 * UserDocument rows for each of REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES —
 * never cached, mirrors getBuyerVerificationStatus in
 * buyerVerification.service.ts. A tractor owner is "verified" only once
 * every required type has an APPROVED document.
 *
 * A given documentType can have more than one UserDocument row over time
 * (a REJECTED submission stays on record while the user resubmits — see
 * document.service.ts's uploadDocument), so rows are read oldest-first
 * and the latest one per type wins, giving the tractor owner's current
 * standing rather than their full history.
 */
export async function getTractorOwnerVerificationStatus(
  tractorOwnerId: string
): Promise<TractorOwnerVerificationStatus> {
  const documents = await prisma.userDocument.findMany({
    where: {
      userId: tractorOwnerId,
      documentType: { in: [...REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES] },
    },
    select: { documentType: true, status: true },
    orderBy: { uploadedAt: "asc" },
  });

  const latestStatusByType = new Map<DocumentType, VerificationStatus>();
  for (const doc of documents) {
    latestStatusByType.set(doc.documentType, doc.status);
  }

  const approvedDocumentTypes: DocumentType[] = [];
  const pendingDocumentTypes: DocumentType[] = [];
  const rejectedDocumentTypes: DocumentType[] = [];
  const missingDocumentTypes: DocumentType[] = [];

  for (const type of REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES) {
    const status = latestStatusByType.get(type);

    if (!status) {
      missingDocumentTypes.push(type);
    } else if (status === VerificationStatus.APPROVED) {
      approvedDocumentTypes.push(type);
    } else if (status === VerificationStatus.PENDING) {
      pendingDocumentTypes.push(type);
    } else {
      rejectedDocumentTypes.push(type);
    }
  }

  return {
    isVerified: approvedDocumentTypes.length === REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES.length,
    requiredDocumentTypes: [...REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES],
    approvedDocumentTypes,
    pendingDocumentTypes,
    rejectedDocumentTypes,
    missingDocumentTypes,
  };
}

/**
 * Gate for tractor-owner-facing booking actions that require full KYC
 * verification (currently: creating a tractor booking targeting this
 * owner, and this owner accepting a received booking — see
 * tractorBooking.service.ts). Throws 403 with the specific missing/
 * pending/rejected document types in `details`, so the client can tell
 * the caller exactly what's outstanding without a second round-trip to
 * the status endpoint. Mirrors assertBuyerVerified in
 * buyerVerification.service.ts.
 */
export async function assertTractorOwnerVerified(tractorOwnerId: string): Promise<void> {
  const status = await getTractorOwnerVerificationStatus(tractorOwnerId);

  if (!status.isVerified) {
    throw new AppError(NOT_VERIFIED_MESSAGE, 403, {
      missingDocumentTypes: status.missingDocumentTypes,
      pendingDocumentTypes: status.pendingDocumentTypes,
      rejectedDocumentTypes: status.rejectedDocumentTypes,
    });
  }
}
