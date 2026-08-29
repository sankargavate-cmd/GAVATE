import { z } from "zod";
import { ADMIN_PERMISSIONS } from "../constants/adminPermissions";

// Mirrors the password policy in auth.validator.ts's signupSchema /
// resetPasswordSchema exactly, so an admin account can never be created or
// reset to a weaker password than a self-signed-up user could choose.
// Duplicated here (rather than imported) since auth.validator.ts doesn't
// export it and this step avoids touching that file further.
const passwordPolicy = z
  .string({ required_error: "password is required" })
  .min(8, "password must be at least 8 characters")
  .max(72, "password must be at most 72 characters")
  .regex(/[A-Za-z]/, "password must contain at least one letter")
  .regex(/[0-9]/, "password must contain at least one number");

const emailField = z
  .string({ required_error: "email is required" })
  .trim()
  .toLowerCase()
  .email("email must be a valid email address")
  .max(255);

const fullNameField = z
  .string({ required_error: "fullName is required" })
  .trim()
  .min(2, "fullName must be at least 2 characters")
  .max(100, "fullName must be at most 100 characters");

const permissionsField = z
  .array(z.enum(ADMIN_PERMISSIONS), {
    invalid_type_error: `each permission must be one of: ${ADMIN_PERMISSIONS.join(", ")}`,
  })
  .max(ADMIN_PERMISSIONS.length)
  // De-duplicate so repeated entries in the request don't produce
  // repeated entries in storage.
  .transform((permissions) => Array.from(new Set(permissions)))
  .optional()
  .default([]);

export const createAdminSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  // The SUPER_ADMIN sets the admin's initial password directly — there is
  // no self-signup or email-verification step for admin accounts (Step 15
  // intentionally does not touch that existing flow).
  password: passwordPolicy,
  preferredLanguage: z
    .string()
    .trim()
    .min(2, "preferredLanguage must be at least 2 characters")
    .max(10, "preferredLanguage must be at most 10 characters")
    .optional()
    .default("en"),
  permissions: permissionsField,
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

// Query params arrive as strings — same coercion pattern as
// searchLabourQuerySchema in labour.validator.ts.
export const listAdminsQuerySchema = z.object({
  // "all" (default) includes active, deactivated, and removed admins;
  // the other values narrow to just that bucket.
  status: z.enum(["all", "active", "deactivated", "removed"]).optional().default("all"),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>;

export const adminIdParamSchema = z.object({
  id: z.string({ required_error: "id is required" }).trim().min(1, "id is required"),
});

export type AdminIdParam = z.infer<typeof adminIdParamSchema>;

// Body for POST /super-admin/admins/:id/reset-password. newPassword is
// optional — if omitted, the service generates a secure random one and
// returns it once in the response.
export const resetAdminPasswordSchema = z.object({
  newPassword: passwordPolicy.optional(),
});

export type ResetAdminPasswordInput = z.infer<typeof resetAdminPasswordSchema>;

// Body for PATCH /super-admin/admins/:id/permissions — replaces the full
// permission set (not a partial add/remove), so the request always states
// the complete intended list.
export const assignPermissionsSchema = z.object({
  permissions: z.array(z.enum(ADMIN_PERMISSIONS), {
    required_error: "permissions is required",
    invalid_type_error: `each permission must be one of: ${ADMIN_PERMISSIONS.join(", ")}`,
  }).transform((permissions) => Array.from(new Set(permissions))),
});

export type AssignPermissionsInput = z.infer<typeof assignPermissionsSchema>;
