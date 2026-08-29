import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as notificationService from "../services/notification.service";
import { listNotificationsQuerySchema } from "../validators/notification.validator";

// requireAuth always runs before these handlers (see
// notification.routes.ts), so req.user is guaranteed to be populated
// here — every handler below scopes strictly to req.user!.id so a user
// can only ever see or modify their own notifications.

export async function getMyNotifications(req: Request, res: Response) {
  const parsed = listNotificationsQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await notificationService.getMyNotifications(req.user!.id, parsed.data);

  res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
    unreadCount: result.unreadCount,
    message: "Notifications fetched successfully",
  });
}

export async function markAsRead(req: Request, res: Response) {
  const notification = await notificationService.markAsRead(req.user!.id, req.params.id);

  res.status(200).json({
    success: true,
    data: notification,
    message: "Notification marked as read",
  });
}

export async function markAllAsRead(req: Request, res: Response) {
  const result = await notificationService.markAllAsRead(req.user!.id);

  res.status(200).json({
    success: true,
    data: { count: result.count },
    message: "All notifications marked as read",
  });
}
