import { apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import { FarmerProfile, FarmerProfileFormInput } from "@/types";

const PROFILE_PATH = "/farmers/profile";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type FarmerProfileResult =
  | ApiResponseWithStatus<FarmerProfile>
  | typeof AUTH_REQUIRED;

export async function fetchFarmerProfile(): Promise<FarmerProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<FarmerProfile>(PROFILE_PATH, {
    method: "GET",
    headers: authHeader,
  });
}

export async function createFarmerProfile(
  input: FarmerProfileFormInput
): Promise<FarmerProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<FarmerProfile>(PROFILE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

export async function updateFarmerProfile(
  input: Partial<FarmerProfileFormInput>
): Promise<FarmerProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<FarmerProfile>(PROFILE_PATH, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}
