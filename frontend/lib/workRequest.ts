import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  WorkRequest,
  WorkRequestFormInput,
  WorkRequestListFilters,
} from "@/types";

const BASE_PATH = "/work-requests";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/labour.ts / lib/farmer.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type WorkRequestResult = ApiResponseWithStatus<WorkRequest> | typeof AUTH_REQUIRED;

/** Farmer-only: send a new work request to a specific (verified) labour
 * user. */
export async function createWorkRequest(
  input: WorkRequestFormInput
): Promise<WorkRequestResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<WorkRequest>(BASE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Farmer-only: withdraw one of their own PENDING/ACCEPTED requests. */
export async function cancelWorkRequest(id: string): Promise<WorkRequestResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<WorkRequest>(`${BASE_PATH}/${id}/cancel`, {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Labour-only: accept or reject one of their own PENDING requests. */
export async function respondToWorkRequest(
  id: string,
  action: "ACCEPT" | "REJECT"
): Promise<WorkRequestResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<WorkRequest>(`${BASE_PATH}/${id}/respond`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ action }),
  });
}

/** The backend's list response puts `pagination` alongside `data`, not
 * inside it (see workRequest.controller.ts listMyWorkRequests) — so the
 * success shape here extends ApiSuccess with that extra field rather than
 * folding it into WorkRequest[]. Mirrors LabourSearchApiSuccess in
 * lib/labour.ts. */
export interface WorkRequestListApiSuccess extends ApiSuccess<WorkRequest[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type WorkRequestListApiBody = WorkRequestListApiSuccess | ApiFailure;

interface WorkRequestListApiResponse {
  status: number;
  body: WorkRequestListApiBody;
}

type WorkRequestListResultOrAuth = WorkRequestListApiResponse | typeof AUTH_REQUIRED;

function buildListQueryString(filters: WorkRequestListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Lists the caller's own work requests — sent, if called by a farmer;
 * received, if called by a labour user. Which side is returned is decided
 * server-side from the JWT's role claim, not by this function. */
export async function listMyWorkRequests(
  filters: WorkRequestListFilters
): Promise<WorkRequestListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<WorkRequest[]>(
    `${BASE_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // WorkRequestListApiSuccess above) — apiRequestWithStatus just doesn't
  // know the type, so this cast reflects what the backend actually sends
  // rather than reshaping the response.
  return { status, body: body as WorkRequestListApiBody };
}
