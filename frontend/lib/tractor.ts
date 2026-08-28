import { ApiFailure, ApiSuccess, ApiResponseWithStatus, apiRequestWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  TractorAvailability,
  TractorProfile,
  TractorProfileFormInput,
  TractorSearchFilters,
} from "@/types";

const PROFILE_PATH = "/tractors/profile";
const AVAILABILITY_PATH = "/tractors/profile/availability";
const SEARCH_PATH = "/tractors/search";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/labour.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type TractorProfileResult = ApiResponseWithStatus<TractorProfile> | typeof AUTH_REQUIRED;

export async function fetchTractorProfile(): Promise<TractorProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorProfile>(PROFILE_PATH, {
    method: "GET",
    headers: authHeader,
  });
}

export async function createTractorProfile(
  input: TractorProfileFormInput
): Promise<TractorProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorProfile>(PROFILE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

export async function updateTractorProfile(
  input: Partial<TractorProfileFormInput>
): Promise<TractorProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorProfile>(PROFILE_PATH, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Hits the dedicated PATCH endpoint for the one field a tractor owner is
 * likely to flip far more often than the rest of their profile. Mirrors
 * setAvailability in lib/labour.ts. */
export async function setTractorAvailability(
  isAvailable: boolean
): Promise<TractorProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorProfile>(AVAILABILITY_PATH, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ isAvailable }),
  });
}

/** Farmer-facing single-listing view (View tractor & book). Mirrors
 * fetchLabourById in lib/labour.ts. */
export async function fetchTractorById(id: string): Promise<TractorProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorProfile>(`/tractors/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

type TractorAvailabilityResult =
  | ApiResponseWithStatus<TractorAvailability>
  | typeof AUTH_REQUIRED;

/** Farmer-facing live availability check for a specific tractor listing —
 * used to re-confirm availability right before submitting a booking, since
 * the profile snapshot shown on the listing page may be stale by then. */
export async function fetchTractorAvailability(
  id: string
): Promise<TractorAvailabilityResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorAvailability>(`/tractors/${id}/availability`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's search response puts `pagination` alongside `data`, not
 * inside it (see tractor.controller.ts searchTractors) — so the success
 * shape here extends ApiSuccess with that extra field rather than folding
 * it into TractorProfile[]. Mirrors LabourSearchApiSuccess in lib/labour.ts. */
export interface TractorSearchApiSuccess extends ApiSuccess<TractorProfile[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type TractorSearchApiBody = TractorSearchApiSuccess | ApiFailure;

interface TractorSearchApiResponse {
  status: number;
  body: TractorSearchApiBody;
}

type TractorSearchResultOrAuth = TractorSearchApiResponse | typeof AUTH_REQUIRED;

function buildSearchQueryString(filters: TractorSearchFilters): string {
  const params = new URLSearchParams();

  if (filters.tractorType) {
    params.set("tractorType", filters.tractorType);
  }
  if (filters.state) {
    params.set("state", filters.state);
  }
  if (filters.district) {
    params.set("district", filters.district);
  }
  if (filters.rateType) {
    params.set("rateType", filters.rateType);
  }
  if (filters.minRate !== undefined) {
    params.set("minRate", String(filters.minRate));
  }
  if (filters.maxRate !== undefined) {
    params.set("maxRate", String(filters.maxRate));
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Farmer-facing search over verified, available tractors. */
export async function searchTractors(
  filters: TractorSearchFilters
): Promise<TractorSearchResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildSearchQueryString(filters);

  const { status, body } = await apiRequestWithStatus<TractorProfile[]>(
    `${SEARCH_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // TractorSearchApiSuccess above) — apiRequestWithStatus just doesn't know
  // the type, so this cast reflects what the backend actually sends rather
  // than reshaping the response.
  return { status, body: body as TractorSearchApiBody };
}
