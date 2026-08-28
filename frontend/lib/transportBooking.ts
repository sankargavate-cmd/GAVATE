import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import {
  TransportBooking,
  TransportBookingFormInput,
  TransportBookingListFilters,
} from "@/types";

const BASE_PATH = "/transport-bookings";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request that the backend would reject with 401. Mirrors
 * lib/tractorBooking.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type TransportBookingResult = ApiResponseWithStatus<TransportBooking> | typeof AUTH_REQUIRED;

/** Farmer-only: send a new booking request to a specific (verified,
 * available) transport provider. */
export async function createTransportBooking(
  input: TransportBookingFormInput
): Promise<TransportBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportBooking>(BASE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Farmer-only: withdraw one of their own PENDING/ACCEPTED bookings. */
export async function cancelTransportBooking(id: string): Promise<TransportBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportBooking>(`${BASE_PATH}/${id}/cancel`, {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Transport-provider-only: accept or reject one of their own PENDING
 * received bookings. */
export async function respondToTransportBooking(
  id: string,
  action: "ACCEPT" | "REJECT"
): Promise<TransportBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportBooking>(`${BASE_PATH}/${id}/respond`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ action }),
  });
}

/** Fetches a single booking the caller is party to, as either the farmer
 * who sent it or the transport provider who received it. */
export async function fetchTransportBookingById(
  id: string
): Promise<TransportBookingResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<TransportBooking>(`${BASE_PATH}/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's list response puts `pagination` alongside `data`, not
 * inside it (see transportBooking.controller.ts listMyTransportBookings) —
 * so the success shape here extends ApiSuccess with that extra field
 * rather than folding it into TransportBooking[]. Mirrors
 * TractorBookingListApiSuccess in lib/tractorBooking.ts. */
export interface TransportBookingListApiSuccess extends ApiSuccess<TransportBooking[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type TransportBookingListApiBody = TransportBookingListApiSuccess | ApiFailure;

interface TransportBookingListApiResponse {
  status: number;
  body: TransportBookingListApiBody;
}

type TransportBookingListResultOrAuth =
  | TransportBookingListApiResponse
  | typeof AUTH_REQUIRED;

function buildListQueryString(filters: TransportBookingListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Lists the caller's own transport bookings — sent, if called by a
 * farmer; received, if called by a transport provider. Which side is
 * returned is decided server-side from the JWT's role claim, not by this
 * function. */
export async function listMyTransportBookings(
  filters: TransportBookingListFilters
): Promise<TransportBookingListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<TransportBooking[]>(
    `${BASE_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // TransportBookingListApiSuccess above) — apiRequestWithStatus just
  // doesn't know the type, so this cast reflects what the backend
  // actually sends rather than reshaping the response.
  return { status, body: body as TransportBookingListApiBody };
}
