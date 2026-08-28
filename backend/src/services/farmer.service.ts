import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import {
  CreateFarmerProfileInput,
  UpdateFarmerProfileInput,
} from "../validators/farmer.validator";

const PROFILE_ALREADY_EXISTS_MESSAGE = "Farmer profile already exists for this account";
const PROFILE_NOT_FOUND_MESSAGE = "Farmer profile not found";

const FARMER_PROFILE_SELECT = {
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
  // Admin-verification outcome (Step 17) — read-only here, mirrors
  // LabourProfile's own-profile select. Never accepted as input; see
  // createFarmerProfileSchema / updateFarmerProfileSchema.
  isVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FarmerProfileSelect;

export type FarmerProfileResult = Prisma.FarmerProfileGetPayload<{
  select: typeof FARMER_PROFILE_SELECT;
}>;

/**
 * Creates a farmer profile for the given user. Fails with 409 if one
 * already exists — this endpoint is create-once; further changes go
 * through updateFarmerProfile.
 */
export async function createFarmerProfile(
  userId: string,
  input: CreateFarmerProfileInput
): Promise<FarmerProfileResult> {
  try {
    return await prisma.farmerProfile.create({
      data: {
        userId,
        ...input,
      },
      select: FARMER_PROFILE_SELECT,
    });
  } catch (err) {
    // Race-condition fallback: two concurrent creates for the same user can
    // both pass application-level checks before either commits.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(PROFILE_ALREADY_EXISTS_MESSAGE, 409);
    }
    throw err;
  }
}

/**
 * Fetches the calling farmer's own profile. 404 if they haven't created
 * one yet.
 */
export async function getFarmerProfile(userId: string): Promise<FarmerProfileResult> {
  const profile = await prisma.farmerProfile.findUnique({
    where: { userId },
    select: FARMER_PROFILE_SELECT,
  });

  if (!profile) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return profile;
}

/**
 * Partially updates the calling farmer's profile. 404 if no profile exists
 * yet — a farmer must POST once before they can PUT.
 */
export async function updateFarmerProfile(
  userId: string,
  input: UpdateFarmerProfileInput
): Promise<FarmerProfileResult> {
  const existing = await prisma.farmerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError(PROFILE_NOT_FOUND_MESSAGE, 404);
  }

  return prisma.farmerProfile.update({
    where: { userId },
    data: input,
    select: FARMER_PROFILE_SELECT,
  });
}
