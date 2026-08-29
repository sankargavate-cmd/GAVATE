import { DocumentType } from "@prisma/client";

// Fixed, application-enforced list of DocumentType values a
// TRANSPORT_PROVIDER-role user must have an APPROVED UserDocument for
// before being treated as a verified transport provider (Step 29).
// Mirrors REQUIRED_TRACTOR_OWNER_DOCUMENT_TYPES in tractorVerification.ts
// — a small, explicit allow-list rather than something derived
// dynamically, so what "verified" means for a transport provider is one
// clear, auditable source of truth.
//
// DRIVING_LICENSE + VEHICLE_RC + TRANSPORT_PERMIT are exactly the
// Transport-Provider-specific entries already in DOCUMENT_TYPES_BY_ROLE's
// Transport Provider list in document.validator.ts, so a transport
// provider submitting any of them goes through the existing upload API
// unchanged.
export const REQUIRED_TRANSPORT_PROVIDER_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.DRIVING_LICENSE,
  DocumentType.VEHICLE_RC,
  DocumentType.TRANSPORT_PERMIT,
];
