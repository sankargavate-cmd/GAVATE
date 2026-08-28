import { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { ListPendingLabourQuery, RejectLabourInput } from "../validators/adminLabour.validator";
import { PaginatedResult } from "./labour.service";

const PROFILE_NOT_FOUND_MESSAGE = "Labour profile not found";
const ALREADY_APPROVED_MESSAGE = "Labour profile is already approved";

// Admin-facing shape — includes verification metadata and a slice of the
// owning user's account info (name/email), neither of which the labour
// user's own LABOUR_PROFILE_SELECT in labour.service.ts exposes, since that
// select is scoped to what the labour user themselves needs back.
const ADMIN_LABOUR_PROFILE_SELECT = {
  id: true,
  userId: true,
  profilePhoto: true,
  mobile: true,
  skills: true,
  experienceYears: true,
  state: true,
  district: true,
  taluka: true,
  village: true,
  address: true,
  latitude: true,
  longitude: true,
  dailyWage: true,
  isAvailable: true,
  isVerified: true,
  verificationStatus: true,
  rejectionReason: true,
  verifiedAt: true,
  verifiedByAdminId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} satisfies Prisma.LabourProfileSelect;

export type AdminLabourProfileResult = Prisma.LabourProfileGetPayload<{
  select: typeof ADMIN_LABOUR_PROFILE_SELECT;
}>;

/**
 * Lists Labour profiles still awaiting admin review (verificationStatus =
 * PENDING), oldest-first so admins naturally work through the queue in the
 * order profiles were submitted.
 */
export async function listPendingLabourProfiles(
  query: ListPendingLabourQuery
): Promise<PaginatedResult<AdminLabourProfileResult>> {
  const { page, limit } = query;

  const where: Prisma.LabourProfileWhereInput = {
    verificationStatus: VerificationStatus.PENDING,
  };

  const [items, total] = await prisma.$transaction([
    prisma.labourProfile.findMany({
      where,
      select: ADMIN_LABOUR_PROFILE_SELECT,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.labourProfile.count({ where }),
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
 * Approves a Labour profile: flips isVerified true, sets verificationStatus
 * APPROVED, stamps verifiedAt/verifiedByAdminId, and clears any prior
 * rejectionReason (covers the "previously rejected, now approved" case).
 * 404 if the profile doesn't exist; 409 if it's already approved, so a
 * double-click / retry doesn't silently re-stamp the decision.
 */
export async function approveLabourProfile(
  labourProfileId: string,
  adminId: string
): Promise<AdminLabourProfileResult> {
  const existing = await prisma.labourProfile.findUnique({
    where: { id: labourProfileId },
    select: { id: true, verificationStatus: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.verificationStatus === VerificationStatus.APPROVED) {
    throw new AppError(ALREADY_APPROVED_MESSAGE, 409);
  }

  return prisma.labourProfile.update({
    where: { id: labourProfileId },
    data: {
      isVerified: true,
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      verifiedByAdminId: adminId,
      rejectionReason: null,
    },
    select: ADMIN_LABOUR_PROFILE_SELECT,
  });
}

/**
 * Rejects a Labour profile with a required reason: sets isVerified false
 * (so a previously-approved profile immediately drops out of farmer
 * search), verificationStatus REJECTED, stamps verifiedAt/verifiedByAdminId,
 * and records the reason. 404 if the profile doesn't exist.
 */
export async function rejectLabourProfile(
  labourProfileId: string,
  adminId: string,
  input: RejectLabourInput
): Promise<AdminLabourProfileResult> {
  const existing = await prisma.labourProfile.findUnique({
    where: { id: labourProfileId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.labourProfile.update({
    where: { id: labourProfileId },
    data: {
      isVerified: false,
      verificationStatus: VerificationStatus.REJECTED,
      verifiedAt: new Date(),
      verifiedByAdminId: adminId,
      rejectionReason: input.reason,
    },
    select: ADMIN_LABOUR_PROFILE_SELECT,
  });
}
