import { apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import { AdminLabourProfile } from "@/types";

const PENDING_PATH = "/admin/labour/pending";

function approvePath(id: string): string {
  return `/admin/labour/${id}/approve`;
}

function rejectPath(id: string): string {
  return `/admin/labour/${id}/reject`;
}

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request the backend would reject with 401. Mirrors
 * lib/labour.ts / lib/farmer.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

/** The backend's pending-list response puts `pagination` alongside `data`,
 * not inside it (see adminLabour.controller.ts listPending) — mirrors the
 * same shape lib/labour.ts uses for searchLabour. */
export interface AdminLabourPendingApiSuccess {
  success: true;
  data: AdminLabourProfile[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  message?: string;
}

export interface AdminLabourApiFailure {
  success: false;
  message: string;
  details?: unknown;
}

export type AdminLabourPendingApiBody = AdminLabourPendingApiSuccess | AdminLabourApiFailure;

interface AdminLabourPendingApiResponse {
  status: number;
  body: AdminLabourPendingApiBody;
}

type AdminLabourPendingResultOrAuth = AdminLabourPendingApiResponse | typeof AUTH_REQUIRED;

/** Fetches the paginated queue of Labour profiles awaiting admin review. */
export async function fetchPendingLabour(
  page: number,
  limit: number
): Promise<AdminLabourPendingResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));

  const { status, body } = await apiRequestWithStatus<AdminLabourProfile[]>(
    `${PENDING_PATH}?${params.toString()}`,
    { method: "GET", headers: authHeader }
  );

  // Same cast rationale as lib/labour.ts's searchLabour: the raw JSON
  // already has `pagination` alongside `data`, apiRequestWithStatus just
  // doesn't know that extra field's type.
  return { status, body: body as AdminLabourPendingApiBody };
}

type AdminLabourActionResult =
  | ApiResponseWithStatus<AdminLabourProfile>
  | typeof AUTH_REQUIRED;

/** Approves a Labour profile. */
export async function approveLabour(id: string): Promise<AdminLabourActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminLabourProfile>(approvePath(id), {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Rejects a Labour profile with a required reason. */
export async function rejectLabour(
  id: string,
  reason: string
): Promise<AdminLabourActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminLabourProfile>(rejectPath(id), {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ reason }),
  });
}
