import { env } from "./env";

/**
 * Cashfree Payment Gateway configuration (Step 35 — integration
 * foundation). Every value here comes from environment variables only
 * (see config/env.ts / .env.example) — nothing is hardcoded, and the
 * client secret is only ever read here and inside cashfree.service.ts,
 * never returned in any HTTP response.
 */

const CASHFREE_SANDBOX_BASE_URL = "https://sandbox.cashfree.com/pg";
const CASHFREE_PRODUCTION_BASE_URL = "https://api.cashfree.com/pg";

// Mirrors isProduction in config/env.ts — anything other than the
// literal string "production" is treated as sandbox, so a typo (or an
// unset value) fails safe toward the non-money-moving environment
// rather than toward production.
const isCashfreeProduction = env.CASHFREE_ENV.toLowerCase() === "production";

export const cashfreeConfig = {
  env: isCashfreeProduction ? "production" : "sandbox",
  baseUrl: isCashfreeProduction ? CASHFREE_PRODUCTION_BASE_URL : CASHFREE_SANDBOX_BASE_URL,
  clientId: env.CASHFREE_CLIENT_ID,
  clientSecret: env.CASHFREE_CLIENT_SECRET,
  apiVersion: env.CASHFREE_API_VERSION,
} as const;

// Free-text gatewayName value stored on Payment rows for every payment
// this module processes (Payment.gatewayName is a plain String column,
// not a Prisma enum — see schema.prisma — precisely so it isn't tied to
// one gateway).
export const CASHFREE_GATEWAY_NAME = "CASHFREE";
