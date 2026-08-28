import { DocumentType, VerificationStatus } from "@prisma/client";
import { REQUIRED_BUYER_DOCUMENT_TYPES } from "../constants/buyerVerification";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";

const NOT_VERIFIED_MESSAGE =
  "Your buyer account is not verified yet. All required KYC documents must be approved before you can make offers.";

export interface BuyerVerificationStatus {
  isVerified: boolean;
  requiredDocumentTypes: DocumentType[];
  approvedDocumentTypes: DocumentType[];
  pendingDocumentTypes: DocumentType[];
  rejectedDocumentTypes: DocumentType[];
  missingDocumentTypes: DocumentType[];
}

// Minimal shape needed to compute a BuyerVerificationStatus — just the
// two columns getBuyerVerificationStatus/getVerifiedBuyerUserIds both
// select off UserDocument, factored out so the batch (multi-buyer) path
// added for Step 31's nearby-buyer search can share the exact same
// computation as the existing single-buyer path below instead of
// reimplementing it.
interface DocumentStatusRecord {
  documentType: DocumentType;
  status: VerificationStatus;
}

/**
 * Reduces an already-fetched list of a single buyer's required-type
 * UserDocument rows down to a BuyerVerificationStatus. Rows are expected
 * oldest-first (see callers' orderBy) so the latest one per type wins,
 * giving the buyer's current standing rather than their full history. A
 * buyer is "verified" only once every required type has an APPROVED
 * document.
 */
function computeVerificationFromDocuments(
  documents: DocumentStatusRecord[]
): BuyerVerificationStatus {
  const latestStatusByType = new Map<DocumentType, VerificationStatus>();
  for (const doc of documents) {
    latestStatusByType.set(doc.documentType, doc.status);
  }

  const approvedDocumentTypes: DocumentType[] = [];
  const pendingDocumentTypes: DocumentType[] = [];
  const rejectedDocumentTypes: DocumentType[] = [];
  const missingDocumentTypes: DocumentType[] = [];

  for (const type of REQUIRED_BUYER_DOCUMENT_TYPES) {
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
    isVerified: approvedDocumentTypes.length === REQUIRED_BUYER_DOCUMENT_TYPES.length,
    requiredDocumentTypes: [...REQUIRED_BUYER_DOCUMENT_TYPES],
    approvedDocumentTypes,
    pendingDocumentTypes,
    rejectedDocumentTypes,
    missingDocumentTypes,
  };
}

/**
 * Computes a buyer's verification status live from their UserDocument
 * rows for each of REQUIRED_BUYER_DOCUMENT_TYPES — never cached, since
 * BUYER-role users have no profile table to cache onto (mirrors how
 * rating.service.ts's recomputeAverageRating skips BUYER for the same
 * reason). A buyer is "verified" only once every required type has an
 * APPROVED document.
 *
 * A given documentType can have more than one UserDocument row over time
 * (a REJECTED submission stays on record while the user resubmits — see
 * document.service.ts's uploadDocument), so rows are read oldest-first
 * and the latest one per type wins, giving the buyer's current standing
 * rather than their full history.
 */
export async function getBuyerVerificationStatus(
  buyerId: string
): Promise<BuyerVerificationStatus> {
  const documents = await prisma.userDocument.findMany({
    where: { userId: buyerId, documentType: { in: [...REQUIRED_BUYER_DOCUMENT_TYPES] } },
    select: { documentType: true, status: true },
    orderBy: { uploadedAt: "asc" },
  });

  return computeVerificationFromDocuments(documents);
}

/**
 * Batch counterpart to getBuyerVerificationStatus's isVerified check, for
 * listing endpoints that need to filter many buyers at once (see
 * buyer.service.ts's findNearbyVerifiedBuyers, Step 31) without one query
 * per candidate. Fetches every relevant UserDocument row for all
 * `buyerIds` in a single query, groups it back out per buyer, and runs
 * each group through the same computeVerificationFromDocuments used
 * above — so the single- and multi-buyer paths can never drift apart.
 * Returns just the subset of `buyerIds` that are fully verified.
 */
export async function getVerifiedBuyerUserIds(buyerIds: string[]): Promise<Set<string>> {
  if (buyerIds.length === 0) {
    return new Set();
  }

  const documents = await prisma.userDocument.findMany({
    where: {
      userId: { in: buyerIds },
      documentType: { in: [...REQUIRED_BUYER_DOCUMENT_TYPES] },
    },
    select: { userId: true, documentType: true, status: true },
    orderBy: { uploadedAt: "asc" },
  });

  const documentsByBuyer = new Map<string, DocumentStatusRecord[]>();
  for (const doc of documents) {
    const list = documentsByBuyer.get(doc.userId) ?? [];
    list.push({ documentType: doc.documentType, status: doc.status });
    documentsByBuyer.set(doc.userId, list);
  }

  const verifiedIds = new Set<string>();
  for (const buyerId of buyerIds) {
    const status = computeVerificationFromDocuments(documentsByBuyer.get(buyerId) ?? []);
    if (status.isVerified) {
      verifiedIds.add(buyerId);
    }
  }

  return verifiedIds;
}

/**
 * Gate for buyer-only marketplace actions that require full verification
 * (currently: creating a produce offer — see produceOffer.service.ts).
 * Throws 403 with the specific missing/pending/rejected document types in
 * `details`, so the client can tell the buyer exactly what's outstanding
 * without a second round-trip to the status endpoint.
 */
export async function assertBuyerVerified(buyerId: string): Promise<void> {
  const status = await getBuyerVerificationStatus(buyerId);

  if (!status.isVerified) {
    throw new AppError(NOT_VERIFIED_MESSAGE, 403, {
      missingDocumentTypes: status.missingDocumentTypes,
      pendingDocumentTypes: status.pendingDocumentTypes,
      rejectedDocumentTypes: status.rejectedDocumentTypes,
    });
  }
}
