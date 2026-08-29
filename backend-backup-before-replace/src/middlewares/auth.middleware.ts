import { Role } from "@prisma/client";
import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthTokenPayload, JWT_ALGORITHM } from "../services/auth.service";
import { AppError } from "./errorHandler";

const MISSING_TOKEN_MESSAGE = "Authentication required";
const INVALID_TOKEN_MESSAGE = "Invalid authentication token";
const EXPIRED_TOKEN_MESSAGE = "Session expired, please log in again";
const FORBIDDEN_MESSAGE = "You do not have permission to perform this action";
const ACCOUNT_UNAVAILABLE_MESSAGE =
  "This account is no longer active. Please contact support.";

/**
 * Pulls the raw token out of `Authorization: Bearer <token>`. Any other
 * scheme, a malformed header, or a missing header all return null so the
 * caller can respond with one consistent "authentication required" error.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

/**
 * Rejects a token that is otherwise cryptographically valid but whose
 * holder shouldn't be trusted anymore: the account was deactivated/removed
 * (adminManagement.service.ts, and isActive generally), or the password
 * was changed after this specific token was issued (auth.service.ts /
 * adminManagement.service.ts resetAdminPassword both stamp
 * passwordChangedAt). One indexed lookup by primary key, added
 * deliberately here — the previous fully-stateless design meant a
 * deactivated account or a leaked token survived until natural JWT
 * expiry regardless of any revocation action taken after issuance.
 */
async function assertSessionStillValid(payload: AuthTokenPayload): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { isActive: true, passwordChangedAt: true },
  });

  if (!user || !user.isActive) {
    throw new AppError(ACCOUNT_UNAVAILABLE_MESSAGE, 401);
  }

  if (user.passwordChangedAt && payload.iat) {
    const passwordChangedAtSeconds = Math.floor(
      user.passwordChangedAt.getTime() / 1000
    );
    if (passwordChangedAtSeconds > payload.iat) {
      throw new AppError(EXPIRED_TOKEN_MESSAGE, 401);
    }
  }
}

/**
 * Verifies the request's JWT and attaches the authenticated user to
 * `req.user`. Rejects with 401 if the token is missing, malformed, has an
 * invalid signature, has expired, belongs to a deactivated/removed
 * account, or predates the account's most recent password change. This is
 * the foundation every protected route (Farmer, Labour, Buyer, Tractor,
 * Admin, ...) builds on via `requireAuth` and, where needed, `requireRole`.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);

  if (!token) {
    return next(new AppError(MISSING_TOKEN_MESSAGE, 401));
  }

  let payload: AuthTokenPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as AuthTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(EXPIRED_TOKEN_MESSAGE, 401));
    }
    return next(new AppError(INVALID_TOKEN_MESSAGE, 401));
  }

  // requireAuth isn't wrapped in asyncHandler at every call site across the
  // app, so the async revocation check below reports failures via
  // next(err) rather than throwing, matching how the sync checks above
  // already behave.
  assertSessionStillValid(payload)
    .then(() => {
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role as Role,
      };
      next();
    })
    .catch(next);
}

/**
 * Restricts a route to one or more roles. Must run after `requireAuth` so
 * `req.user` is already populated — usage: `requireAuth, requireRole(Role.FARMER)`.
 * Takes a variadic list of roles so a route can allow more than one
 * (e.g. `requireRole(Role.FARMER, Role.LABOUR)`).
 */
export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(MISSING_TOKEN_MESSAGE, 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(FORBIDDEN_MESSAGE, 403);
    }

    next();
  };
}
