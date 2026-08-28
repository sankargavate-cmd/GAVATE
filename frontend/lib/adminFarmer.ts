import { apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import { AdminFarmerProfile } from "@/types";

const PENDING_PATH = "/admin/farmers/pending";

function byIdPath(id: string): string {
  return `/admin/farmers/${id}`;
}

function approvePath(id: string): string {
  return `/admin/farmers/${id}/approve`;
}

function rejectPath(id: string): string {
  return `/admin/farmers/${id}/reject`;
}

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request the backend would reject with 401. Mirrors
 * lib/adminLabour.ts / lib/labour.ts / lib/farmer.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

/** The backend's pending-list response puts `pagination` alongside `data`,
 * not inside it (see adminFarmer.controller.ts listPending) — mirrors the
 * same shape lib/adminLabour.ts uses for fetchPendingLabour. */
export interface AdminFarmerPendingApiSuccess {
  success: true;
  data: AdminFarmerProfile[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  message?: string;
}

export interface AdminFarmerApiFailure {
  success: false;
  message: string;
  details?: unknown;
}

export type AdminFarmerPendingApiBody = AdminFarmerPendingApiSuccess | AdminFarmerApiFailure;

interface AdminFarmerPendingApiResponse {
  status: number;
  body: AdminFarmerPendingApiBody;
}

type AdminFarmerPendingResultOrAuth = AdminFarmerPendingApiResponse | typeof AUTH_REQUIRED;

/** Fetches the paginated queue of Farmer profiles awaiting admin review. */
export async function fetchPendingFarmers(
  page: number,
  limit: number
): Promise<AdminFarmerPendingResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));

  const { status, body } = await apiRequestWithStatus<AdminFarmerProfile[]>(
    `${PENDING_PATH}?${params.toString()}`,
    { method: "GET", headers: authHeader }
  );

  // Same cast rationale as lib/adminLabour.ts's fetchPendingLabour: the raw
  // JSON already has `pagination` alongside `data`.
  return { status, body: body as AdminFarmerPendingApiBody };
}

type AdminFarmerActionResult =
  | ApiResponseWithStatus<AdminFarmerProfile>
  | typeof AUTH_REQUIRED;

/** Fetches a single Farmer profile by id (admin-facing shape, with
 * verification metadata). */
export async function fetchFarmerById(id: string): Promise<AdminFarmerActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminFarmerProfile>(byIdPath(id), {
    method: "GET",
    headers: authHeader,
  });
}

/** Approves a Farmer profile. */
export async function approveFarmer(id: string): Promise<AdminFarmerActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminFarmerProfile>(approvePath(id), {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Rejects a Farmer profile with a required reason. */
export async function rejectFarmer(
  id: string,
  reason: string
): Promise<AdminFarmerActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminFarmerProfile>(rejectPath(id), {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ reason }),
  });
}
