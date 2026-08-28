import { PrismaClient } from "@prisma/client";
import { isProduction } from "./env";

// Prevent multiple PrismaClient instances during dev hot-reload
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: isProduction ? ["error", "warn"] : ["query", "error", "warn"],
  });

if (!isProduction) {
  global.__prisma__ = prisma;
}
