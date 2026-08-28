import { Request, Response } from "express";
import { AppError } from "../middlewares/errorHandler";
import * as authService from "../services/auth.service";
import {
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from "../validators/auth.validator";

export async function signup(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const user = await authService.signup(parsed.data);

  res.status(201).json({
    success: true,
    data: user,
    message: "Account created successfully",
  });
}

export async function verifyEmail(req: Request, res: Response) {
  const parsed = verifyEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const user = await authService.verifyEmail(parsed.data.token);

  res.status(200).json({
    success: true,
    data: user,
    message: "Email verified successfully",
  });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  const result = await authService.login(parsed.data);

  res.status(200).json({
    success: true,
    data: result,
    message: "Logged in successfully",
  });
}

export async function resendVerification(req: Request, res: Response) {
  const parsed = resendVerificationSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  await authService.resendVerification(parsed.data.email);

  res.status(200).json({
    success: true,
    data: null,
    message:
      "If an account with that email exists and is not yet verified, a verification link has been sent.",
  });
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  await authService.forgotPassword(parsed.data);

  res.status(200).json({
    success: true,
    data: null,
    message:
      "If an account with that email exists, a password reset link has been sent.",
  });
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new AppError("Validation failed", 400, parsed.error.flatten().fieldErrors);
  }

  await authService.resetPassword(parsed.data);

  res.status(200).json({
    success: true,
    data: null,
    message: "Password has been reset successfully",
  });
}
