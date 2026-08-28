import { DocumentType } from "@prisma/client";

// Fixed, application-enforced list of DocumentType values a BUYER-role
// user must have an APPROVED UserDocument for before being treated as a
// verified buyer (Step 28). Mirrors ADMIN_PERMISSIONS in
// adminPermissions.ts — a small, explicit allow-list rather than
// something derived dynamically, so what "verified" means for a buyer is
// one clear, auditable source of truth.
//
// PAN_CARD covers identity, GST_CERTIFICATE covers business legitimacy —
// both are already in DOCUMENT_TYPES_BY_ROLE's Buyer list in
// document.validator.ts, so a buyer submitting either goes through the
// existing upload API unchanged.
export const REQUIRED_BUYER_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.PAN_CARD,
  DocumentType.GST_CERTIFICATE,
];
