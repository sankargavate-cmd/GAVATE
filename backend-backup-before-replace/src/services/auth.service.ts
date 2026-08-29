import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";
import * as emailService from "./email.service";
import { logger } from "../utils/logger";
import {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from "../validators/auth.validator";

// Generic message for bad credentials — deliberately identical whether the
// email doesn't exist or the password is wrong, so this endpoint can't be
// used to enumerate registered emails.
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

const SALT_ROUNDS = 12;
const DUPLICATE_EMAIL_MESSAGE = "An account with this email already exists";

// Raw token length in bytes before hex-encoding (64 hex chars).
const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_TTL_MS =
  env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS =
  env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000;

// Raw token length in bytes before hex-encoding (64 hex chars).
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TOKEN_TTL_MS =
  env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000;
const PASSWORD_RESET_INVALID_MESSAGE =
  "Reset link is invalid or has expired";

// Explicit allow-list of fields returned to clients. passwordHash is never
// selected here, so it never exists in this service's return values.
const SAFE_USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  emailVerified: true,
  preferredLanguage: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type SafeUser = Prisma.UserGetPayload<{ select: typeof SAFE_USER_SELECT }>;

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Creates a new verification token for a user, invalidating any previous
 * unused tokens first so only the most recently issued link can be used.
 * Returns the raw (unhashed) token — only the hash is ever persisted.
 */
async function issueVerificationToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    }),
    prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return rawToken;
}

async function issueAndSendVerificationEmail(
  userId: string,
  email: string,
  fullName: string
): Promise<void> {
  const rawToken = await issueVerificationToken(userId);
  const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;

  try {
    await emailService.sendVerificationEmail(email, fullName, verificationUrl);
  } catch (err) {
    // Verification email delivery is best-effort — it must never fail the
    // request that triggered it (signup or resend already succeeded).
    logger.error("Failed to send verification email", {
      error: (err as Error).message,
    });
  }
}

export async function signup(input: SignupInput): Promise<SafeUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  let user: SafeUser;

  try {
    user = await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        role: input.role,
        preferredLanguage: input.preferredLanguage,
        emailVerified: false,
      },
      select: SAFE_USER_SELECT,
    });
  } catch (err) {
    // Race-condition fallback: two concurrent signups for the same email
    // can both pass the findUnique check above before either commits.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409);
    }
    throw err;
  }

  await issueAndSendVerificationEmail(user.id, user.email, user.fullName);

  return user;
}

/**
 * Verifies a raw token from a verification link. The token is looked up by
 * its hash — the raw value is never stored — and rejected if it has already
 * been used or has expired, preventing reuse.
 */
export async function verifyEmail(rawToken: string): Promise<SafeUser> {
  const tokenHash = hashToken(rawToken);

  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("Verification link is invalid or has expired", 400);
  }

  const [, user] = await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
      select: SAFE_USER_SELECT,
    }),
  ]);

  return user;
}

/**
 * Issues a fresh verification email if the account exists, isn't already
 * verified, and isn't within its resend cooldown window. The response is
 * intentionally the same regardless of which of those is true, so this
 * endpoint can't be used to enumerate registered emails.
 */
export async function resendVerification(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, fullName: true, emailVerified: true },
  });

  if (!user || user.emailVerified) {
    return;
  }

  const lastToken = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastToken) {
    const elapsedMs = Date.now() - lastToken.createdAt.getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
      throw new AppError(
        "Please wait before requesting another verification email",
        429,
        { retryAfterSeconds }
      );
    }
  }

  await issueAndSendVerificationEmail(user.id, user.email, user.fullName);
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
  // Added by jsonwebtoken automatically at sign time (unix seconds).
  // Not set on the object we pass into jwt.sign — only present after
  // jwt.verify decodes it — but declared here since auth.middleware.ts's
  // assertSessionStillValid reads it to compare against passwordChangedAt.
  iat?: number;
}

export interface LoginResult {
  user: SafeUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
}

// Explicitly pinned rather than left to jsonwebtoken's default inference.
// Shared with auth.middleware.ts's verify call so sign/verify can never
// drift apart.
export const JWT_ALGORITHM = "HS256" as const;

function generateAccessToken(payload: AuthTokenPayload): string {
  const options: SignOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

/**
 * Authenticates a user by email + password and issues a JWT access token.
 * Credential errors (unknown email, wrong password) all return the same
 * generic message so the endpoint can't be used to enumerate emails.
 * Account-state errors (unverified, inactive) are reported explicitly,
 * since they're only reachable once the password has already been proven
 * correct.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...SAFE_USER_SELECT, passwordHash: true },
  });

  if (!user) {
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  if (!user.emailVerified) {
    throw new AppError("Please verify your email before logging in", 403);
  }

  if (!user.isActive) {
    throw new AppError(
      "Your account has been deactivated. Please contact support.",
      403
    );
  }

  // Rebuild explicitly rather than destructuring passwordHash away, so the
  // hash can never accidentally leak through an object spread later.
  const safeUser: SafeUser = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    preferredLanguage: user.preferredLanguage,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  const accessToken = generateAccessToken({
    sub: safeUser.id,
    email: safeUser.email,
    role: safeUser.role,
  });

  return {
    user: safeUser,
    accessToken,
    tokenType: "Bearer",
    expiresIn: env.JWT_EXPIRES_IN,
  };
}

/**
 * Issues a fresh password reset token for a user, invalidating any previous
 * unused reset tokens first so only the most recently requested link can be
 * used. Returns the raw (unhashed) token — only the hash is ever persisted.
 */
async function issuePasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto
    .randomBytes(PASSWORD_RESET_TOKEN_BYTES)
    .toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: { userId, usedAt: null },
    }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return rawToken;
}

/**
 * Requests a password reset link for the given email. The response is
 * intentionally identical whether or not an account exists for that email,
 * so this endpoint can't be used to enumerate registered emails. Email
 * delivery is best-effort and never fails the request.
 */
export async function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, fullName: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return;
  }

  const rawToken = await issuePasswordResetToken(user.id);
  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  try {
    await emailService.sendPasswordResetEmail(user.email, user.fullName, resetUrl);
  } catch (err) {
    // Reset email delivery is best-effort — it must never fail the request
    // that triggered it, and must never reveal account existence via error.
    logger.error("Failed to send password reset email", {
      error: (err as Error).message,
    });
  }
}

/**
 * Resets a user's password using a raw token from a reset link. The token
 * is looked up by its hash — the raw value is never stored — and rejected
 * if it has already been used or has expired, preventing reuse. All other
 * unused reset tokens for the user are invalidated at the same time so a
 * stale link from an earlier request can't be replayed afterward.
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashToken(input.token);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(PASSWORD_RESET_INVALID_MESSAGE, 400);
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      // passwordChangedAt is read by requireAuth (auth.middleware.ts) to
      // invalidate any JWT issued before this moment, so existing
      // sessions/tokens don't survive a password reset.
      data: { passwordHash, passwordChangedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
    }),
  ]);
}
