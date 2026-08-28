import dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: requireEnv("NODE_ENV", "development"),
  // Render sets PORT itself at runtime; the "5000" fallback only applies locally.
  PORT: parseInt(requireEnv("PORT", "5000"), 10),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  // Comma-separated list of allowed frontend origins, e.g.
  // "https://shetkari-sathi.vercel.app,https://shetkari-sathi-git-preview.vercel.app"
  CORS_ORIGIN: requireEnv("CORS_ORIGIN", "http://localhost:3000"),
  FRONTEND_URL: requireEnv("FRONTEND_URL", "http://localhost:3000"),

  // Email verification
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: parseInt(
    requireEnv("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", "24"),
    10
  ),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: parseInt(
    requireEnv("EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS", "60"),
    10
  ),

  // Password reset
  PASSWORD_RESET_TOKEN_TTL_MINUTES: parseInt(
    requireEnv("PASSWORD_RESET_TOKEN_TTL_MINUTES", "30"),
    10
  ),

  // Email sending. No real provider is wired up yet — "console" logs the
  // email instead of sending it, which is safe for local development.
  EMAIL_PROVIDER: requireEnv("EMAIL_PROVIDER", "console"),

  // JWT access tokens issued on login.
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: requireEnv("JWT_EXPIRES_IN", "1d"),

  // Cashfree Payment Gateway (Step 35 — integration foundation).
  // CASHFREE_ENV selects which Cashfree base URL is used: "sandbox"
  // (https://sandbox.cashfree.com/pg) for testing, "production"
  // (https://api.cashfree.com/pg) for real money movement. Defaults to
  // "sandbox" so a missing/unset value can never accidentally hit
  // production. See config/cashfree.ts for how this resolves to a URL.
  CASHFREE_ENV: requireEnv("CASHFREE_ENV", "sandbox"),
  // x-client-id / x-client-secret from the Cashfree Merchant Dashboard.
  // Server-side only — never sent to the frontend/client in any
  // response (see cashfree.service.ts / payment.controller.ts).
  CASHFREE_CLIENT_ID: requireEnv("CASHFREE_CLIENT_ID"),
  CASHFREE_CLIENT_SECRET: requireEnv("CASHFREE_CLIENT_SECRET"),
  // API version header Cashfree requires on every REST call. Format
  // YYYY-MM-DD, see Cashfree's "x-api-version" docs.
  CASHFREE_API_VERSION: requireEnv("CASHFREE_API_VERSION", "2025-01-01"),
};

export const isProduction = env.NODE_ENV === "production";

// CORS_ORIGIN may be a single origin or a comma-separated list (useful when
// both the Vercel production URL and preview-deployment URLs need access).
export const corsOrigins = env.CORS_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
