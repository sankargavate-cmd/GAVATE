import { apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import {
  LoginFormInput,
  LoginResult,
  SafeUser,
  SignupFormInput,
} from "@/types";

export function signup(
  input: SignupFormInput
): Promise<ApiResponseWithStatus<SafeUser>> {
  return apiRequestWithStatus<SafeUser>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(
  input: LoginFormInput
): Promise<ApiResponseWithStatus<LoginResult>> {
  return apiRequestWithStatus<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resendVerification(
  email: string
): Promise<ApiResponseWithStatus<null>> {
  return apiRequestWithStatus<null>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
