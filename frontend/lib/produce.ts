import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  ProduceListing,
  ProduceListingFormInput,
  ProduceSearchFilters,
  PublicProduceListing,
} from "@/types";

const LISTINGS_PATH = "/produce/listings";
const SEARCH_PATH = "/produce/search";
const LISTING_PATH = "/produce";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/labour.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type ProduceListingResult = ApiResponseWithStatus<ProduceListing> | typeof AUTH_REQUIRED;

/** The backend's list/search responses put `pagination` alongside `data`,
 * not inside it (see produce.controller.ts) — so the success shape here
 * extends ApiSuccess with that extra field rather than folding it into
 * the array type. Mirrors LabourSearchApiSuccess in lib/labour.ts. */
export interface ProduceListPaginatedSuccess<T> extends ApiSuccess<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ProduceListPaginatedBody<T> = ProduceListPaginatedSuccess<T> | ApiFailure;

interface ProduceListPaginatedResponse<T> {
  status: number;
  body: ProduceListPaginatedBody<T>;
}

type ProduceListPaginatedResultOrAuth<T> =
  | ProduceListPaginatedResponse<T>
  | typeof AUTH_REQUIRED;

// --- Farmer-facing: manage own listings ---

export async function createProduceListing(
  input: ProduceListingFormInput
): Promise<ProduceListingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ProduceListing>(LISTINGS_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

export async function fetchOwnProduceListings(
  page = 1,
  limit = 20
): Promise<ProduceListPaginatedResultOrAuth<ProduceListing>> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });

  const { status, body } = await apiRequestWithStatus<ProduceListing[]>(
    `${LISTINGS_PATH}?${params.toString()}`,
    { method: "GET", headers: authHeader }
  );

  return { status, body: body as ProduceListPaginatedBody<ProduceListing> };
}

export async function updateProduceListing(
  id: string,
  input: Partial<ProduceListingFormInput>
): Promise<ProduceListingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ProduceListing>(`${LISTINGS_PATH}/${id}`, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

export async function deleteProduceListing(
  id: string
): Promise<ApiResponseWithStatus<null> | typeof AUTH_REQUIRED> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<null>(`${LISTINGS_PATH}/${id}`, {
    method: "DELETE",
    headers: authHeader,
  });
}

// --- Buyer-facing: browse verified, active listings ---

function buildSearchQueryString(filters: ProduceSearchFilters): string {
  const params = new URLSearchParams();

  if (filters.crop) {
    params.set("crop", filters.crop);
  }
  if (filters.location) {
    params.set("location", filters.location);
  }
  if (filters.unit) {
    params.set("unit", filters.unit);
  }
  if (filters.minPrice !== undefined) {
    params.set("minPrice", String(filters.minPrice));
  }
  if (filters.maxPrice !== undefined) {
    params.set("maxPrice", String(filters.maxPrice));
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

export async function searchProduceListings(
  filters: ProduceSearchFilters
): Promise<ProduceListPaginatedResultOrAuth<PublicProduceListing>> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildSearchQueryString(filters);

  const { status, body } = await apiRequestWithStatus<PublicProduceListing[]>(
    `${SEARCH_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  return { status, body: body as ProduceListPaginatedBody<PublicProduceListing> };
}

export async function fetchPublicProduceListing(
  id: string
): Promise<ApiResponseWithStatus<PublicProduceListing> | typeof AUTH_REQUIRED> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<PublicProduceListing>(`${LISTING_PATH}/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}
