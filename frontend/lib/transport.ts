import { ApiFailure, ApiSuccess, ApiResponseWithStatus, apiRequestWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  TransportAvailability,
  TransportProfile,
  TransportProfileFormInput,
  TransportSearchFilters,
} from "@/types";

const PROFILE_PATH = "/transport/profile";
const AVAILABILITY_PATH = "/transport/profile/availability";
const SEARCH_PATH = "/transport/search";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/tractor.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type TransportProfileResult = ApiResponseWithStatus<TransportProfile> | typeof AUTH_REQUIRED;

export async function fetchTransportProfile(): Promise<TransportProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportProfile>(PROFILE_PATH, {
    method: "GET",
    headers: authHeader,
  });
}

export async function createTransportProfile(
  input: TransportProfileFormInput
): Promise<TransportProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportProfile>(PROFILE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

export async function updateTransportProfile(
  input: Partial<TransportProfileFormInput>
): Promise<TransportProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportProfile>(PROFILE_PATH, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Hits the dedicated PATCH endpoint for the one field a transport
 * provider is likely to flip far more often than the rest of their
 * profile. Mirrors setTractorAvailability in lib/tractor.ts. */
export async function setTransportAvailability(
  isAvailable: boolean
): Promise<TransportProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportProfile>(AVAILABILITY_PATH, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ isAvailable }),
  });
}

/** Farmer-facing single-listing view (View provider & book). Mirrors
 * fetchTractorById in lib/tractor.ts. */
export async function fetchTransportById(id: string): Promise<TransportProfileResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportProfile>(`/transport/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

type TransportAvailabilityResult =
  | ApiResponseWithStatus<TransportAvailability>
  | typeof AUTH_REQUIRED;

/** Farmer-facing live availability check for a specific transport
 * listing — used to re-confirm availability right before submitting a
 * booking, since the profile snapshot shown on the listing page may be
 * stale by then. */
export async function fetchTransportAvailability(
  id: string
): Promise<TransportAvailabilityResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportAvailability>(`/transport/${id}/availability`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's search response puts `pagination` alongside `data`, not
 * inside it (see transport.controller.ts searchTransportProviders) — so
 * the success shape here extends ApiSuccess with that extra field rather
 * than folding it into TransportProfile[]. Mirrors TractorSearchApiSuccess
 * in lib/tractor.ts. */
export interface TransportSearchApiSuccess extends ApiSuccess<TransportProfile[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type TransportSearchApiBody = TransportSearchApiSuccess | ApiFailure;

interface TransportSearchApiResponse {
  status: number;
  body: TransportSearchApiBody;
}

type TransportSearchResultOrAuth = TransportSearchApiResponse | typeof AUTH_REQUIRED;

function buildSearchQueryString(filters: TransportSearchFilters): string {
  const params = new URLSearchParams();

  if (filters.vehicleType) {
    params.set("vehicleType", filters.vehicleType);
  }
  if (filters.state) {
    params.set("state", filters.state);
  }
  if (filters.district) {
    params.set("district", filters.district);
  }
  if (filters.capacityUnit) {
    params.set("capacityUnit", filters.capacityUnit);
  }
  if (filters.minCapacity !== undefined) {
    params.set("minCapacity", String(filters.minCapacity));
  }
  if (filters.maxCapacity !== undefined) {
    params.set("maxCapacity", String(filters.maxCapacity));
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

/** Farmer-facing search over verified, available transport providers. */
export async function searchTransportProviders(
  filters: TransportSearchFilters
): Promise<TransportSearchResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildSearchQueryString(filters);

  const { status, body } = await apiRequestWithStatus<TransportProfile[]>(
    `${SEARCH_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // TransportSearchApiSuccess above) — apiRequestWithStatus just doesn't
  // know the type, so this cast reflects what the backend actually sends
  // rather than reshaping the response.
  return { status, body: body as TransportSearchApiBody };
}
