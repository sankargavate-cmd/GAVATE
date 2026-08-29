import { DocumentType, Role } from "@prisma/client";
import { z } from "zod";

// Mirrors the DocumentType enum in schema.prisma.
const DOCUMENT_TYPES = Object.values(DocumentType) as [DocumentType, ...DocumentType[]];

const documentTypeField = z.enum(DOCUMENT_TYPES, {
  required_error: "documentType is required",
  invalid_type_error: `documentType must be one of: ${DOCUMENT_TYPES.join(", ")}`,
});

// Reference/path to the already-uploaded file (e.g. an S3/Cloudinary
// URL) — this API registers the document, it does not accept the binary
// upload itself. Mirrors profilePhoto/photos URL fields elsewhere in this
// codebase (farmer.validator.ts, produce.validator.ts, tractor.validator.ts).
const documentUrlField = z
  .string({ required_error: "documentUrl is required" })
  .trim()
  .url("documentUrl must be a valid URL")
  .max(2048, "documentUrl must be at most 2048 characters");

export const uploadDocumentSchema = z.object({
  documentType: documentTypeField,
  documentUrl: documentUrlField,
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  documentType: documentTypeField.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

// Which DocumentType values each role is allowed to submit. The four
// "common to every role" types (AADHAAR_CARD, PAN_CARD, PROFILE_PHOTO,
// BANK_PASSBOOK) plus OTHER are appended to every role's list below rather
// than repeated inline, so adding a new common type only means editing
// COMMON_DOCUMENT_TYPES once.
const COMMON_DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.AADHAAR_CARD,
  DocumentType.PAN_CARD,
  DocumentType.PROFILE_PHOTO,
  DocumentType.BANK_PASSBOOK,
  DocumentType.OTHER,
];

// Roles that may register documents in this step. Mirrors the app's five
// KYC-bearing roles named in this step's scope — ADMIN/SUPER_ADMIN/
// MACHINERY_PROVIDER are intentionally excluded (no document workflow for
// them yet).
export const DOCUMENT_TYPES_BY_ROLE: Partial<Record<Role, DocumentType[]>> = {
  [Role.FARMER]: [
    ...COMMON_DOCUMENT_TYPES,
    DocumentType.SEVEN_TWELVE_EXTRACT,
    DocumentType.LAND_OWNERSHIP_PROOF,
  ],
  [Role.LABOUR]: [...COMMON_DOCUMENT_TYPES, DocumentType.DRIVING_LICENSE],
  [Role.BUYER]: [
    ...COMMON_DOCUMENT_TYPES,
    DocumentType.GST_CERTIFICATE,
    DocumentType.SHOP_ESTABLISHMENT_LICENSE,
  ],
  [Role.TRACTOR_OWNER]: [
    ...COMMON_DOCUMENT_TYPES,
    DocumentType.DRIVING_LICENSE,
    DocumentType.TRACTOR_RC,
  ],
  [Role.TRANSPORT_PROVIDER]: [
    ...COMMON_DOCUMENT_TYPES,
    DocumentType.DRIVING_LICENSE,
    DocumentType.VEHICLE_RC,
    DocumentType.TRANSPORT_PERMIT,
  ],
};
