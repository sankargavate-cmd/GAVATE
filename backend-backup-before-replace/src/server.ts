import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";
import { logger } from "./utils/logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`SHETKARI SATHI backend running on http://localhost:${env.PORT}`);
  logger.info(`Health check: http://localhost:${env.PORT}/api/v1/health`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Server closed. Prisma disconnected.");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
