import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  TractorBooking,
  TractorBookingFormInput,
  TractorBookingListFilters,
} from "@/types";

const BASE_PATH = "/tractor-bookings";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/workRequest.ts / lib/labour.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type TractorBookingResult = ApiResponseWithStatus<TractorBooking> | typeof AUTH_REQUIRED;

/** Farmer-only: send a new booking request to a specific (verified,
 * available) tractor owner. */
export async function createTractorBooking(
  input: TractorBookingFormInput
): Promise<TractorBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorBooking>(BASE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Farmer-only: withdraw one of their own PENDING/ACCEPTED bookings. */
export async function cancelTractorBooking(id: string): Promise<TractorBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorBooking>(`${BASE_PATH}/${id}/cancel`, {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Tractor-owner-only: accept or reject one of their own PENDING received
 * bookings. */
export async function respondToTractorBooking(
  id: string,
  action: "ACCEPT" | "REJECT"
): Promise<TractorBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorBooking>(`${BASE_PATH}/${id}/respond`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ action }),
  });
}

/** Fetches a single booking the caller is party to, as either the farmer
 * who sent it or the tractor owner who received it. */
export async function fetchTractorBookingById(
  id: string
): Promise<TractorBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TractorBooking>(`${BASE_PATH}/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's list response puts `pagination` alongside `data`, not
 * inside it (see tractorBooking.controller.ts listMyTractorBookings) — so
 * the success shape here extends ApiSuccess with that extra field rather
 * than folding it into TractorBooking[]. Mirrors WorkRequestListApiSuccess
 * in lib/workRequest.ts. */
export interface TractorBookingListApiSuccess extends ApiSuccess<TractorBooking[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type TractorBookingListApiBody = TractorBookingListApiSuccess | ApiFailure;

interface TractorBookingListApiResponse {
  status: number;
  body: TractorBookingListApiBody;
}

type TractorBookingListResultOrAuth = TractorBookingListApiResponse | typeof AUTH_REQUIRED;

function buildListQueryString(filters: TractorBookingListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Lists the caller's own tractor bookings — sent, if called by a farmer;
 * received, if called by a tractor owner. Which side is returned is
 * decided server-side from the JWT's role claim, not by this function. */
export async function listMyTractorBookings(
  filters: TractorBookingListFilters
): Promise<TractorBookingListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<TractorBooking[]>(
    `${BASE_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // TractorBookingListApiSuccess above) — apiRequestWithStatus just doesn't
  // know the type, so this cast reflects what the backend actually sends
  // rather than reshaping the response.
  return { status, body: body as TractorBookingListApiBody };
}
