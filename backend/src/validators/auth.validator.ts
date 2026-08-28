import { Role } from "@prisma/client";
import { z } from "zod";

// ADMIN and SUPER_ADMIN are deliberately excluded from public self-signup
// (Step 13 / Step 15) — both are provisioned out-of-band: SUPER_ADMIN
// directly in the DB / a seed script, ADMIN only via the SUPER_ADMIN
// admin-management API (POST /super-admin/admins). Every other role stays
// self-service exactly as before.
const PUBLIC_SIGNUP_ROLES = Object.values(Role).filter(
  (role) => role !== Role.ADMIN && role !== Role.SUPER_ADMIN
) as [Role, ...Role[]];

export const signupSchema = z.object({
  fullName: z
    .string({ required_error: "fullName is required" })
    .trim()
    .min(2, "fullName must be at least 2 characters")
    .max(100, "fullName must be at most 100 characters"),

  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()
    .email("email must be a valid email address")
    .max(255),

  // bcrypt silently ignores bytes beyond 72, so cap the input length there.
  password: z
    .string({ required_error: "password is required" })
    .min(8, "password must be at least 8 characters")
    .max(72, "password must be at most 72 characters")
    .regex(/[A-Za-z]/, "password must contain at least one letter")
    .regex(/[0-9]/, "password must contain at least one number"),

  role: z.enum(PUBLIC_SIGNUP_ROLES, {
    required_error: "role is required",
    invalid_type_error: `role must be one of: ${PUBLIC_SIGNUP_ROLES.join(", ")}`,
  }),

  preferredLanguage: z
    .string({ required_error: "preferredLanguage is required" })
    .trim()
    .min(2, "preferredLanguage must be at least 2 characters")
    .max(10, "preferredLanguage must be at most 10 characters"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const verifyEmailSchema = z.object({
  token: z
    .string({ required_error: "token is required" })
    .trim()
    .min(32, "token is invalid")
    .max(256, "token is invalid"),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()
    .email("email must be a valid email address")
    .max(255),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const loginSchema = z.object({
  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()
    .email("email must be a valid email address")
    .max(255),

  // Intentionally no complexity rules here — login must accept whatever
  // password the account was created with, even if password policy
  // (min length, regex, etc.) changes after signup.
  password: z
    .string({ required_error: "password is required" })
    .min(1, "password is required")
    .max(72, "password must be at most 72 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Shared password policy — must match signupSchema's password rule exactly,
// since a reset must not let a user set a weaker password than signup allows.
const passwordPolicy = z
  .string({ required_error: "password is required" })
  .min(8, "password must be at least 8 characters")
  .max(72, "password must be at most 72 characters")
  .regex(/[A-Za-z]/, "password must contain at least one letter")
  .regex(/[0-9]/, "password must contain at least one number");

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "email is required" })
    .trim()
    .toLowerCase()
    .email("email must be a valid email address")
    .max(255),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: "token is required" })
    .trim()
    .min(32, "token is invalid")
    .max(256, "token is invalid"),

  password: passwordPolicy,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
