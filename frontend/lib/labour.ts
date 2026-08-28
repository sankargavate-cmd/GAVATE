import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import { LabourProfile, LabourProfileFormInput, LabourSearchFilters } from "@/types";

const PROFILE_PATH = "/labour/profile";
const AVAILABILITY_PATH = "/labour/profile/availability";
const SEARCH_PATH = "/labour/search";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/farmer.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type LabourProfileResult = ApiResponseWithStatus<LabourProfile> | typeof AUTH_REQUIRED;

export async function fetchLabourProfile(): Promise<LabourProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<LabourProfile>(PROFILE_PATH, {
    method: "GET",
    headers: authHeader,
  });
}

export async function createLabourProfile(
  input: LabourProfileFormInput
): Promise<LabourProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<LabourProfile>(PROFILE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

export async function updateLabourProfile(
  input: Partial<LabourProfileFormInput>
): Promise<LabourProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<LabourProfile>(PROFILE_PATH, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Hits the dedicated PATCH endpoint for the one field a labour user is
 * likely to flip far more often than the rest of their profile. */
export async function setAvailability(
  isAvailable: boolean
): Promise<LabourProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<LabourProfile>(AVAILABILITY_PATH, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ isAvailable }),
  });
}

/** Farmer-facing single-listing view (View profile). Mirrors
 * fetchPublicProduceListing in lib/produce.ts. */
export async function fetchLabourById(id: string): Promise<LabourProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<LabourProfile>(`/labour/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's search response puts `pagination` alongside `data`, not
 * inside it (see labour.controller.ts searchLabour) — so the success shape
 * here extends ApiSuccess with that extra field rather than folding it
 * into LabourProfile[]. */
export interface LabourSearchApiSuccess extends ApiSuccess<LabourProfile[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type LabourSearchApiBody = LabourSearchApiSuccess | ApiFailure;

interface LabourSearchApiResponse {
  status: number;
  body: LabourSearchApiBody;
}

type LabourSearchResultOrAuth = LabourSearchApiResponse | typeof AUTH_REQUIRED;

function buildSearchQueryString(filters: LabourSearchFilters): string {
  const params = new URLSearchParams();

  if (filters.skills && filters.skills.length > 0) {
    params.set("skills", filters.skills.join(","));
  }
  if (filters.state) {
    params.set("state", filters.state);
  }
  if (filters.district) {
    params.set("district", filters.district);
  }
  if (filters.minWage !== undefined) {
    params.set("minWage", String(filters.minWage));
  }
  if (filters.maxWage !== undefined) {
    params.set("maxWage", String(filters.maxWage));
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Farmer-facing search over verified, available labour. */
export async function searchLabour(
  filters: LabourSearchFilters
): Promise<LabourSearchResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildSearchQueryString(filters);

  const { status, body } = await apiRequestWithStatus<LabourProfile[]>(
    `${SEARCH_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // LabourSearchApiSuccess above) — apiRequestWithStatus just doesn't know
  // the type, so this cast reflects what the backend actually sends rather
  // than reshaping the response.
  return { status, body: body as LabourSearchApiBody };
}
