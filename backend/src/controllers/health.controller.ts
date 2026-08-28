import { Request, Response } from "express";
import { prisma } from "../config/database";

/**
 * Basic health check. Confirms the API process is up and, separately,
 * whether it can reach the database — useful for local setup verification
 * and later for uptime/monitoring checks.
 */
export async function getHealth(_req: Request, res: Response) {
  let dbStatus: "connected" | "unreachable" = "unreachable";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
    dbStatus = "unreachable";
  }

  res.status(200).json({
    success: true,
    data: {
      service: "shetkari-sathi-backend",
      status: "ok",
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
  });
}
