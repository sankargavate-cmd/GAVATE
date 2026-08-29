import { DocumentType, VerificationStatus } from "@prisma/client";
import { REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES } from "../constants/transportVerification";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";

const NOT_VERIFIED_MESSAGE =
  "This transport provider is not verified yet. All required KYC documents must be approved before transport bookings can be created or accepted.";

export interface TransportProviderVerificationStatus {
  isVerified: boolean;
  requiredDocumentTypes: DocumentType[];
  approvedDocumentTypes: DocumentType[];
  pendingDocumentTypes: DocumentType[];
  rejectedDocumentTypes: DocumentType[];
  missingDocumentTypes: DocumentType[];
}

/**
 * Computes a transport provider's verification status live from their
 * UserDocument rows for each of
 * REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES — never cached, mirrors
 * getTractorOwnerVerificationStatus in tractorVerification.service.ts. A
 * transport provider is "verified" only once every required type has an
 * APPROVED document.
 *
 * A given documentType can have more than one UserDocument row over time
 * (a REJECTED submission stays on record while the user resubmits — see
 * document.service.ts's uploadDocument), so rows are read oldest-first
 * and the latest one per type wins, giving the transport provider's
 * current standing rather than their full history.
 */
export async function getTransportProviderVerificationStatus(
  transportProviderId: string
): Promise<TransportProviderVerificationStatus> {
  const documents = await prisma.userDocument.findMany({
    where: {
      userId: transportProviderId,
      documentType: { in: [...REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES] },
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

  for (const type of REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES) {
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
    isVerified:
      approvedDocumentTypes.length === REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES.length,
    requiredDocumentTypes: [...REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES],
    approvedDocumentTypes,
    pendingDocumentTypes,
    rejectedDocumentTypes,
    missingDocumentTypes,
  };
}

/**
 * Gate for transport-provider-facing booking actions that require full
 * KYC verification (currently: creating a transport booking targeting
 * this provider, and this provider accepting a received booking — see
 * transportBooking.service.ts). Throws 403 with the specific missing/
 * pending/rejected document types in `details`, so the client can tell
 * the caller exactly what's outstanding without a second round-trip to
 * the status endpoint. Mirrors assertTractorOwnerVerified in
 * tractorVerification.service.ts.
 */
export async function assertTransportProviderVerified(
  transportProviderId: string
): Promise<void> {
  const status = await getTransportProviderVerificationStatus(transportProviderId);

  if (!status.isVerified) {
    throw new AppError(NOT_VERIFIED_MESSAGE, 403, {
      missingDocumentTypes: status.missingDocumentTypes,
      pendingDocumentTypes: status.pendingDocumentTypes,
      rejectedDocumentTypes: status.rejectedDocumentTypes,
    });
  }
}
