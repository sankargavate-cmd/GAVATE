import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../config/database";
import { AppError } from "../middlewares/errorHandler";
import {
  AssignPermissionsInput,
  CreateAdminInput,
  ListAdminsQuery,
} from "../validators/adminManagement.validator";
import { PaginatedResult } from "./labour.service";

// Must match auth.service.ts's SALT_ROUNDS so admin-account password
// hashes are indistinguishable in cost from self-signup hashes.
const SALT_ROUNDS = 12;

const DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists";
const ADMIN_NOT_FOUND_MESSAGE = "Admin not found";
const ADMIN_ALREADY_ACTIVE_MESSAGE = "Admin is already active";
const ADMIN_ALREADY_INACTIVE_MESSAGE = "Admin is already deactivated";
const ADMIN_ACCESS_REMOVED_MESSAGE =
  "This admin's access has been removed and cannot be reactivated. Create a new admin instead";
const ADMIN_ALREADY_REMOVED_MESSAGE = "This admin's access has already been removed";

// Explicit allow-list, mirroring auth.service.ts's SAFE_USER_SELECT —
// passwordHash is never selected here, so it never exists in this
// service's return values. Nests the AdminProfile so callers get
// permissions/removal metadata in one shape.
const ADMIN_WITH_PROFILE_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  emailVerified: true,
  preferredLanguage: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  adminProfile: {
    select: {
      id: true,
      permissions: true,
      mustChangePassword: true,
      createdByAdminId: true,
      removedAt: true,
      removedByAdminId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type AdminWithProfileResult = Prisma.UserGetPayload<{
  select: typeof ADMIN_WITH_PROFILE_SELECT;
}>;

/**
 * Creates a new ADMIN-role user plus its AdminProfile. Created directly by
 * a SUPER_ADMIN with a SUPER_ADMIN-chosen password, so — unlike public
 * signup — emailVerified is set true immediately; there is no separate
 * verification step for admin-provisioned accounts. Fails with 409 if the
 * email is already in use.
 */
export async function createAdmin(
  input: CreateAdminInput,
  superAdminId: string
): Promise<AdminWithProfileResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    return await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: Role.ADMIN,
        emailVerified: true,
        preferredLanguage: input.preferredLanguage,
        adminProfile: {
          create: {
            permissions: input.permissions,
            createdByAdminId: superAdminId,
          },
        },
      },
      select: ADMIN_WITH_PROFILE_SELECT,
    });
  } catch (err) {
    // Race-condition fallback: two concurrent creates for the same email
    // can both pass the findUnique check above before either commits.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409);
    }
    throw err;
  }
}

/**
 * Lists ADMIN-role users (never SUPER_ADMIN — this endpoint is scoped to
 * the accounts a SUPER_ADMIN actually manages), optionally filtered by
 * status, newest-first.
 */
export async function listAdmins(
  query: ListAdminsQuery
): Promise<PaginatedResult<AdminWithProfileResult>> {
  const { status, page, limit } = query;

  const where: Prisma.UserWhereInput = {
    role: Role.ADMIN,
    ...(status === "active" ? { isActive: true, adminProfile: { removedAt: null } } : {}),
    ...(status === "deactivated"
      ? { isActive: false, adminProfile: { removedAt: null } }
      : {}),
    ...(status === "removed" ? { adminProfile: { removedAt: { not: null } } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: ADMIN_WITH_PROFILE_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
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
 * Fetches a single admin by id. 404 (with the same message as "not found")
 * if the id doesn't exist OR belongs to a non-ADMIN user — a SUPER_ADMIN
 * can't use this to peek at farmer/labour/other-super-admin accounts.
 */
export async function getAdminById(id: string): Promise<AdminWithProfileResult> {
  const admin = await prisma.user.findFirst({
    where: { id, role: Role.ADMIN },
    select: ADMIN_WITH_PROFILE_SELECT,
  });

  if (!admin) {
    throw new AppError(ADMIN_NOT_FOUND_MESSAGE, 404);
  }

  return admin;
}


/**
 * Reactivates a previously-deactivated admin. 409 if already active, or if
 * access was removed (removal is one-way — see AdminProfile.removedAt).
 */
export async function activateAdmin(id: string): Promise<AdminWithProfileResult> {
  const admin = await getAdminById(id);

  if (admin.adminProfile?.removedAt) {
    throw new AppError(ADMIN_ACCESS_REMOVED_MESSAGE, 409);
  }

  if (admin.isActive) {
    throw new AppError(ADMIN_ALREADY_ACTIVE_MESSAGE, 409);
  }

  return prisma.user.update({
    where: { id },
    data: { isActive: true },
    select: ADMIN_WITH_PROFILE_SELECT,
  });
}

/**
 * Temporarily suspends an admin's access (blocks login via the existing
 * isActive check in auth.service.ts's login — no change needed there).
 * Reversible via activateAdmin, unlike removeAdminAccess. 409 if already
 * inactive.
 */
export async function deactivateAdmin(id: string): Promise<AdminWithProfileResult> {
  const admin = await getAdminById(id);

  if (!admin.isActive) {
    throw new AppError(ADMIN_ALREADY_INACTIVE_MESSAGE, 409);
  }

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: ADMIN_WITH_PROFILE_SELECT,
  });
}

/**
 * Permanently revokes an admin's access: deactivates the account and
 * stamps AdminProfile.removedAt/removedByAdminId. One-way — a removed
 * admin cannot be reactivated via activateAdmin (see the check there); a
 * replacement admin must be created instead. 409 if already removed.
 */
export async function removeAdminAccess(
  id: string,
  superAdminId: string
): Promise<AdminWithProfileResult> {
  const admin = await getAdminById(id);

  if (admin.adminProfile?.removedAt) {
    throw new AppError(ADMIN_ALREADY_REMOVED_MESSAGE, 409);
  }

  return prisma.user.update({
    where: { id },
    data: {
      isActive: false,
      adminProfile: {
        update: {
          removedAt: new Date(),
          removedByAdminId: superAdminId,
        },
      },
    },
    select: ADMIN_WITH_PROFILE_SELECT,
  });
}

export interface ResetAdminPasswordResult {
  admin: AdminWithProfileResult;
  // Only ever present in this one response — never persisted or logged in
  // plaintext anywhere. The SUPER_ADMIN is responsible for relaying it to
  // the admin through a secure out-of-band channel.
  temporaryPassword: string;
}

function generateTemporaryPassword(): string {
  // 18 random bytes -> 24-char base64url string, then guarantee it
  // satisfies passwordPolicy (letter + number) by appending a fixed
  // suffix — the random prefix already provides the entropy.
  const random = crypto.randomBytes(18).toString("base64url");
  return `${random}A1`;
}

/**
 * Resets an admin's password. If newPassword isn't supplied, generates a
 * secure random temporary one and returns it once. Sets
 * AdminProfile.mustChangePassword true as metadata for a future login
 * flow to consult — this step does not itself enforce it.
 */
export async function resetAdminPassword(
  id: string,
  newPassword: string | undefined
): Promise<ResetAdminPasswordResult> {
  await getAdminById(id);

  const plaintextPassword = newPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(plaintextPassword, SALT_ROUNDS);

  const admin = await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      // Invalidates any existing JWT for this admin — see requireAuth in
      // auth.middleware.ts and the matching field on resetPassword in
      // auth.service.ts.
      passwordChangedAt: new Date(),
      adminProfile: {
        update: { mustChangePassword: true },
      },
    },
    select: ADMIN_WITH_PROFILE_SELECT,
  });

  return { admin, temporaryPassword: plaintextPassword };
}

/**
 * Replaces an admin's full permission set. Validator-level enum + de-dupe
 * already guarantee the array is a clean subset of ADMIN_PERMISSIONS.
 */
export async function assignPermissions(
  id: string,
  input: AssignPermissionsInput
): Promise<AdminWithProfileResult> {
  await getAdminById(id);

  return prisma.user.update({
    where: { id },
    data: {
      adminProfile: {
        update: { permissions: input.permissions },
      },
    },
    select: ADMIN_WITH_PROFILE_SELECT,
  });
}
