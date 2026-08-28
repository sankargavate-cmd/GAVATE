import { apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  AdminListResult,
  AdminStatusFilter,
  AdminWithProfile,
  CreateAdminFormInput,
  ResetAdminPasswordFormInput,
  ResetAdminPasswordResult,
} from "@/types";

const BASE_PATH = "/super-admin/admins";

function adminPath(id: string): string {
  return `${BASE_PATH}/${id}`;
}

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request the backend would reject with 401. Mirrors
 * lib/adminLabour.ts / lib/labour.ts / lib/farmer.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

export interface AdminListApiSuccess {
  success: true;
  data: AdminWithProfile[];
  pagination: AdminListResult["pagination"];
  message?: string;
}

export interface AdminManagementApiFailure {
  success: false;
  message: string;
  details?: unknown;
}

export type AdminListApiBody = AdminListApiSuccess | AdminManagementApiFailure;

interface AdminListApiResponse {
  status: number;
  body: AdminListApiBody;
}

type AdminListResultOrAuth = AdminListApiResponse | typeof AUTH_REQUIRED;

/** Fetches the paginated list of ADMIN-role accounts, optionally filtered
 * by status. Mirrors listAdmins on the backend
 * (adminManagement.controller.ts). */
export async function listAdmins(
  page: number,
  limit: number,
  status: AdminStatusFilter = "all"
): Promise<AdminListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  params.set("status", status);

  const { status: httpStatus, body } = await apiRequestWithStatus<AdminWithProfile[]>(
    `${BASE_PATH}?${params.toString()}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` alongside `data`;
  // apiRequestWithStatus just doesn't know that extra field's type — same
  // cast rationale as lib/adminLabour.ts's fetchPendingLabour.
  return { status: httpStatus, body: body as AdminListApiBody };
}

type AdminActionResult =
  | ApiResponseWithStatus<AdminWithProfile>
  | typeof AUTH_REQUIRED;

/** Fetches a single admin by id. */
export async function getAdmin(id: string): Promise<AdminActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminWithProfile>(adminPath(id), {
    method: "GET",
    headers: authHeader,
  });
}

/** Creates a new ADMIN-role account. */
export async function createAdmin(
  input: CreateAdminFormInput
): Promise<AdminActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminWithProfile>(BASE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Reactivates a previously-deactivated admin. */
export async function activateAdmin(id: string): Promise<AdminActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminWithProfile>(`${adminPath(id)}/activate`, {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Temporarily suspends an admin's access. Reversible via activateAdmin. */
export async function deactivateAdmin(id: string): Promise<AdminActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminWithProfile>(`${adminPath(id)}/deactivate`, {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Permanently revokes an admin's access. One-way — cannot be undone via
 * activateAdmin afterwards. */
export async function removeAdmin(id: string): Promise<AdminActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminWithProfile>(adminPath(id), {
    method: "DELETE",
    headers: authHeader,
  });
}

type ResetPasswordResult =
  | ApiResponseWithStatus<ResetAdminPasswordResult>
  | typeof AUTH_REQUIRED;

/** Resets an admin's password. If newPassword is omitted, the backend
 * generates a secure random one and returns it once in the response. */
export async function resetAdminPassword(
  id: string,
  input: ResetAdminPasswordFormInput
): Promise<ResetPasswordResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ResetAdminPasswordResult>(
    `${adminPath(id)}/reset-password`,
    {
      method: "PATCH",
      headers: authHeader,
      body: JSON.stringify(input),
    }
  );
}

/** Replaces an admin's full permission set (not a partial add/remove). */
export async function assignPermissions(
  id: string,
  permissions: string[]
): Promise<AdminActionResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<AdminWithProfile>(`${adminPath(id)}/permissions`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ permissions }),
  });
}
