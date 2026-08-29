/* Minimal logger wrapper so log calls are centralized and easy to swap
 * out for a real logging library (pino/winston) later without touching
 * call sites across the codebase. */

type LogMeta = Record<string, unknown> | undefined;

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (message: string, meta?: LogMeta) => {
    console.log(`[INFO] ${timestamp()} - ${message}`, meta ?? "");
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${timestamp()} - ${message}`, meta ?? "");
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${timestamp()} - ${message}`, meta ?? "");
  },
};
