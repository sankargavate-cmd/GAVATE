import { DocumentType } from "@prisma/client";

// Fixed, application-enforced list of DocumentType values a TRACTOR_OWNER
// -role user must have an APPROVED UserDocument for before being treated
// as a verified tractor owner (Step 29). Mirrors
// REQUIRED_BUYER_DOCUMENT_TYPES in buyerVerification.ts — a small,
// explicit allow-list rather than something derived dynamically, so what
// "verified" means for a tractor owner is one clear, auditable source of
// truth.
//
// DRIVING_LICENSE + TRACTOR_RC are exactly the Tractor-Owner-specific
// entries already in DOCUMENT_TYPES_BY_ROLE's Tractor Owner list in
// document.validator.ts, so a tractor owner submitting either goes
// through the existing upload API unchanged.
export const REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.DRIVING_LICENSE,
  DocumentType.TRACTOR_RC,
];
