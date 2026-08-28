import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import { UpdateLocationInput } from "../validators/location.validator";

const USER_NOT_FOUND_MESSAGE = "User not found";

// Explicit allow-list of the six Location Engine fields (Step 30) plus
// updatedAt (so a client can tell when the location was last saved).
// Deliberately excludes every other User field (fullName, email,
// passwordHash, role, ...) — mirrors SAFE_USER_SELECT in auth.service.ts,
// this endpoint has no business returning anything beyond location.
const USER_LOCATION_SELECT = {
  state: true,
  district: true,
  taluka: true,
  village: true,
  latitude: true,
  longitude: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserLocationResult = Prisma.UserGetPayload<{
  select: typeof USER_LOCATION_SELECT;
}>;

/**
 * Fetches the calling user's own location fields. All six fields may be
 * null (never set, or only partially set) — this simply reflects
 * whatever the user has saved so far, with no notion of "not found" for
 * an authenticated user's own record.
 */
export async function getMyLocation(userId: string): Promise<UserLocationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_LOCATION_SELECT,
  });

  if (!user) {
    // Can only happen if the user backing a valid JWT was deleted after
    // the token was issued — requireAuth doesn't hit the DB, so this is
    // the first point such a token would be caught.
    throw new AppError(USER_NOT_FOUND_MESSAGE, 404);
  }

  return user;
}

/**
 * Saves/updates one or more of the calling user's location fields.
 * Role-agnostic and available to every authenticated role (including
 * BUYER, which has no profile table of its own) — unlike
 * FarmerProfile/LabourProfile/TractorProfile/TransportProfile's location
 * fields, which only exist for roles with a profile. A partial update:
 * only the fields present in `input` are changed, so a user can update
 * just their coordinates without resending state/district/taluka/village
 * (validator.ts's updateLocationSchema already guarantees at least one
 * field is present).
 */
export async function updateMyLocation(
  userId: string,
  input: UpdateLocationInput
): Promise<UserLocationResult> {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: input,
      select: USER_LOCATION_SELECT,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new AppError(USER_NOT_FOUND_MESSAGE, 404);
    }
    throw err;
  }
}
