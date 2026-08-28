import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  CreateRatingFormInput,
  Rating,
  RatingListFilters,
  UpdateRatingFormInput,
} from "@/types";

const BASE_PATH = "/ratings";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/workRequest.ts / lib/order.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type RatingResult = ApiResponseWithStatus<Rating> | typeof AUTH_REQUIRED;
type RatingDeleteResult = ApiResponseWithStatus<null> | typeof AUTH_REQUIRED;

/** Farmer-only: submit a new rating against a completed engagement
 * (WorkRequest, TractorBooking, TransportBooking, or Order — decided by
 * input.targetType). */
export async function createRating(input: CreateRatingFormInput): Promise<RatingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<Rating>(BASE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Farmer-only: edit the rating value and/or review text on one of the
 * caller's own ratings. Which engagement it was left against is
 * immutable, so input only ever carries rating/review. */
export async function updateRating(
  id: string,
  input: UpdateRatingFormInput
): Promise<RatingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<Rating>(`${BASE_PATH}/${id}`, {
    method: "PUT",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Farmer-only: delete one of the caller's own ratings. */
export async function deleteRating(id: string): Promise<RatingDeleteResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<null>(`${BASE_PATH}/${id}`, {
    method: "DELETE",
    headers: authHeader,
  });
}

/** Fetches a single rating the caller is party to, as either the farmer
 * who left it or the user it was left about. */
export async function fetchRatingById(id: string): Promise<RatingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<Rating>(`${BASE_PATH}/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's list response puts `pagination` alongside `data`, not
 * inside it (see rating.controller.ts listGivenRatings/listReceivedRatings)
 * — so the success shape here extends ApiSuccess with that extra field
 * rather than folding it into Rating[]. Mirrors WorkRequestListApiSuccess
 * in lib/workRequest.ts. */
export interface RatingListApiSuccess extends ApiSuccess<Rating[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type RatingListApiBody = RatingListApiSuccess | ApiFailure;

interface RatingListApiResponse {
  status: number;
  body: RatingListApiBody;
}

type RatingListResultOrAuth = RatingListApiResponse | typeof AUTH_REQUIRED;

function buildListQueryString(filters: RatingListFilters): string {
  const params = new URLSearchParams();

  if (filters.targetType) {
    params.set("targetType", filters.targetType);
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Farmer-only: lists ratings the caller has given, most recent first. */
export async function listGivenRatings(
  filters: RatingListFilters
): Promise<RatingListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<Rating[]>(
    `${BASE_PATH}/given?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // RatingListApiSuccess above) — apiRequestWithStatus just doesn't know
  // the type, so this cast reflects what the backend actually sends
  // rather than reshaping the response.
  return { status, body: body as RatingListApiBody };
}

/** Lists ratings the caller has received, most recent first. Valid for
 * any ratee role (Labour, Tractor Owner, Transport Provider, Buyer). */
export async function listReceivedRatings(
  filters: RatingListFilters
): Promise<RatingListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<Rating[]>(
    `${BASE_PATH}/received?${query}`,
    { method: "GET", headers: authHeader }
  );

  return { status, body: body as RatingListApiBody };
}

/** Public (any authenticated user) summary + review list for a specific
 * ratee — e.g. what a farmer sees on a Labour/Tractor/Transport detail
 * page. The backend nests averageRating/ratingCount/reviews inside `data`
 * and puts `pagination` alongside it (see rating.controller.ts
 * getUserRatingSummary), so the success shape mirrors that rather than
 * reusing RatingListApiSuccess. */
export interface RatingSummaryData {
  averageRating: number | null;
  ratingCount: number;
  reviews: Rating[];
}

export interface RatingSummaryApiSuccess extends ApiSuccess<RatingSummaryData> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type RatingSummaryApiBody = RatingSummaryApiSuccess | ApiFailure;

interface RatingSummaryApiResponse {
  status: number;
  body: RatingSummaryApiBody;
}

type RatingSummaryResultOrAuth = RatingSummaryApiResponse | typeof AUTH_REQUIRED;

/** Fetches the rating summary (average + count) and paginated reviews for
 * a specific ratee. Any authenticated user may call this — it's not
 * restricted to the caller's own ratings. */
export async function fetchUserRatingSummary(
  userId: string,
  filters: RatingListFilters
): Promise<RatingSummaryResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<RatingSummaryData>(
    `${BASE_PATH}/user/${userId}?${query}`,
    { method: "GET", headers: authHeader }
  );

  return { status, body: body as RatingSummaryApiBody };
}
