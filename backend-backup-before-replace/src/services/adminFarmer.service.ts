import { Prisma, VerificationStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { ListPendingFarmerQuery, RejectFarmerInput } from "../validators/adminFarmer.validator";
import { PaginatedResult } from "./labour.service";

const PROFILE_NOT_FOUND_MESSAGE = "Farmer profile not found";
const ALREADY_APPROVED_MESSAGE = "Farmer profile is already approved";

// Admin-facing shape — includes verification metadata and a slice of the
// owning user's account info (name/email), neither of which the farmer
// user's own FARMER_PROFILE_SELECT in farmer.service.ts exposes, since that
// select is scoped to what the farmer user themselves needs back. Mirrors
// ADMIN_LABOUR_PROFILE_SELECT in adminLabour.service.ts.
const ADMIN_FARMER_PROFILE_SELECT = {
  id: true,
  userId: true,
  profilePhoto: true,
  mobile: true,
  state: true,
  district: true,
  taluka: true,
  village: true,
  address: true,
  latitude: true,
  longitude: true,
  farmingExperience: true,
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
} satisfies Prisma.FarmerProfileSelect;

export type AdminFarmerProfileResult = Prisma.FarmerProfileGetPayload<{
  select: typeof ADMIN_FARMER_PROFILE_SELECT;
}>;

/**
 * Lists Farmer profiles still awaiting admin review (verificationStatus =
 * PENDING), oldest-first so admins naturally work through the queue in the
 * order profiles were submitted. Mirrors listPendingLabourProfiles.
 */
export async function listPendingFarmerProfiles(
  query: ListPendingFarmerQuery
): Promise<PaginatedResult<AdminFarmerProfileResult>> {
  const { page, limit } = query;

  const where: Prisma.FarmerProfileWhereInput = {
    verificationStatus: VerificationStatus.PENDING,
  };

  const [items, total] = await prisma.$transaction([
    prisma.farmerProfile.findMany({
      where,
      select: ADMIN_FARMER_PROFILE_SELECT,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.farmerProfile.count({ where }),
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
 * Fetches a single Farmer profile by id, with the same admin-facing shape
 * as the pending listing — lets the admin UI show verification status
 * (including a past rejection reason) for a specific farmer outside the
 * pending queue too.
 */
export async function getFarmerProfileById(id: string): Promise<AdminFarmerProfileResult> {
  const profile = await prisma.farmerProfile.findUnique({
    where: { id },
    select: ADMIN_FARMER_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Approves a Farmer profile: flips isVerified true, sets verificationStatus
 * APPROVED, stamps verifiedAt/verifiedByAdminId, and clears any prior
 * rejectionReason (covers the "previously rejected, now approved" case).
 * 404 if the profile doesn't exist; 409 if it's already approved, so a
 * double-click / retry doesn't silently re-stamp the decision. Mirrors
 * approveLabourProfile.
 */
export async function approveFarmerProfile(
  farmerProfileId: string,
  adminId: string
): Promise<AdminFarmerProfileResult> {
  const existing = await prisma.farmerProfile.findUnique({
    where: { id: farmerProfileId },
    select: { id: true, verificationStatus: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  if (existing.verificationStatus === VerificationStatus.APPROVED) {
    throw new AppError(ALREADY_APPROVED_MESSAGE, 409);
  }

  return prisma.farmerProfile.update({
    where: { id: farmerProfileId },
    data: {
      isVerified: true,
      verificationStatus: VerificationStatus.APPROVED,
      verifiedAt: new Date(),
      verifiedByAdminId: adminId,
      rejectionReason: null,
    },
    select: ADMIN_FARMER_PROFILE_SELECT,
  });
}

/**
 * Rejects a Farmer profile with a required reason: sets isVerified false
 * (so a previously-approved profile immediately drops out of any future
 * verified-farmer listing), verificationStatus REJECTED, stamps
 * verifiedAt/verifiedByAdminId, and records the reason. 404 if the profile
 * doesn't exist. Mirrors rejectLabourProfile.
 */
export async function rejectFarmerProfile(
  farmerProfileId: string,
  adminId: string,
  input: RejectFarmerInput
): Promise<AdminFarmerProfileResult> {
  const existing = await prisma.farmerProfile.findUnique({
    where: { id: farmerProfileId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.farmerProfile.update({
    where: { id: farmerProfileId },
    data: {
      isVerified: false,
      verificationStatus: VerificationStatus.REJECTED,
      verifiedAt: new Date(),
      verifiedByAdminId: adminId,
      rejectionReason: input.reason,
    },
    select: ADMIN_FARMER_PROFILE_SELECT,
  });
}
