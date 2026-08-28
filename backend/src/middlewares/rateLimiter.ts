import { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "./errorHandler";

/**
 * Minimal in-memory fixed-window rate limiter, scoped to auth endpoints
 * that were previously fully unprotected against brute-force/abuse
 * (login password guessing, signup spam, forgot-password email bombing).
 *
 * No external dependency (e.g. express-rate-limit) is introduced here —
 * this keeps the fix self-contained and installable offline. In-memory
 * state means limits reset on process restart and aren't shared across
 * horizontally-scaled instances; that's an acceptable tradeoff for this
 * single-instance-baseline app and is strictly better than no limiting at
 * all. Revisit with a shared store (Redis, etc.) if/when this app runs as
 * multiple instances.
 *
 * Keyed by IP + (optionally) the request's email field, so a single
 * attacker can't bypass the limit by rotating emails from one IP, nor
 * flood one victim's account from many IPs beyond the shared cap.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

// Lazily sweep expired entries on access instead of running a background
// timer — keeps this dependency-free and avoids keeping the process alive
// via an interval handle.
function prune(now: number) {
  if (buckets.size < 10000) return;
  for (const [key, state] of buckets) {
    if (state.resetAt <= now) buckets.delete(key);
  }
}

function hit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= max) {
    return false;
  }

  existing.count += 1;
  return true;
}

/**
 * Builds a rate-limit middleware. `max` requests per `windowMs` per
 * IP+email combination. Falls back to IP alone if the body has no email
 * (e.g. malformed request) — still bounded, never skipped.
 */
export function authRateLimit(max: number, windowMs: number): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip ?? "unknown";
    const email =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const key = `${ip}:${email}`;

    if (!hit(key, windowMs, max)) {
      throw new AppError("Too many attempts. Please try again later.", 429);
    }

    next();
  };
}
