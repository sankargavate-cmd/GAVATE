import { env, isProduction } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Email-sending abstraction. No real provider (SES/SendGrid/etc.) is wired
 * up yet, so every provider currently falls back to logging the email
 * instead of sending it. This keeps the verification flow fully testable
 * in development without risking accidental real sends, and gives future
 * steps a single place to plug in a real provider.
 *
 * The verificationUrl/resetUrl embed a raw, unhashed, single-use security
 * token (see auth.service.ts). This fallback is dev-only in intent, but
 * EMAIL_PROVIDER could still end up unset/misconfigured in production
 * before a real provider is wired up — so the raw token is withheld from
 * logs whenever isProduction is true, regardless of which branch runs.
 * Log aggregation is generally far less access-controlled than the email
 * inbox the token was meant to be gated behind.
 */

async function sendViaConsole(
  to: string,
  fullName: string,
  verificationUrl: string
): Promise<void> {
  logger.info("Verification email (dev mode — not actually sent)", {
    to,
    fullName,
    ...(isProduction ? {} : { verificationUrl }),
  });
}

export async function sendVerificationEmail(
  to: string,
  fullName: string,
  verificationUrl: string
): Promise<void> {
  switch (env.EMAIL_PROVIDER) {
    case "console":
      return sendViaConsole(to, fullName, verificationUrl);
    default:
      logger.warn(
        `EMAIL_PROVIDER "${env.EMAIL_PROVIDER}" has no real implementation yet; falling back to console`
      );
      return sendViaConsole(to, fullName, verificationUrl);
  }
}

async function sendPasswordResetViaConsole(
  to: string,
  fullName: string,
  resetUrl: string
): Promise<void> {
  logger.info("Password reset email (dev mode — not actually sent)", {
    to,
    fullName,
    ...(isProduction ? {} : { resetUrl }),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  resetUrl: string
): Promise<void> {
  switch (env.EMAIL_PROVIDER) {
    case "console":
      return sendPasswordResetViaConsole(to, fullName, resetUrl);
    default:
      logger.warn(
        `EMAIL_PROVIDER "${env.EMAIL_PROVIDER}" has no real implementation yet; falling back to console`
      );
      return sendPasswordResetViaConsole(to, fullName, resetUrl);
  }
}
