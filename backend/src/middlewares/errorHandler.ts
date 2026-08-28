import { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env";
import { logger } from "../utils/logger";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Must keep all 4 params for Express to recognize this as an error handler.
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const details = isAppError ? err.details : undefined;

  logger.error(`${req.method} ${req.originalUrl} -> ${err.message}`, {
    statusCode,
  });

  // AppError messages are hand-authored by this app's own code and are
  // always safe to return as-is (every intentional error path across the
  // whole app — including payments/webhooks — throws one). A raw,
  // non-AppError exception (e.g. a DB connectivity error, an unexpected
  // third-party library failure) was never written with an end user in
  // mind and can carry internal details (hostnames, file paths, library
  // internals) — its message is only surfaced in non-production, mirroring
  // how `stack` is already gated below, so production responses never leak
  // more than a generic message for a genuinely unexpected failure.
  const message = isAppError || !isProduction ? err.message : "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message: message || "Internal Server Error",
    ...(details ? { details } : {}),
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
