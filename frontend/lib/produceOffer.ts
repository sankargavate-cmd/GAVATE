import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import { ProduceOffer, ProduceOfferFormInput, ProduceOfferListFilters } from "@/types";

const BASE_PATH = "/produce-offers";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request the backend would reject with 401. Mirrors
 * lib/transportBooking.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type ProduceOfferResult = ApiResponseWithStatus<ProduceOffer> | typeof AUTH_REQUIRED;

/** Buyer-only: send a new offer on a specific (verified, active) produce
 * listing. */
export async function createProduceOffer(
  input: ProduceOfferFormInput
): Promise<ProduceOfferResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ProduceOffer>(BASE_PATH, {
    method: "POST",
    headers: authHeader,
    body: JSON.stringify(input),
  });
}

/** Buyer-only: withdraw one of their own PENDING offers. */
export async function withdrawProduceOffer(id: string): Promise<ProduceOfferResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ProduceOffer>(`${BASE_PATH}/${id}/withdraw`, {
    method: "PATCH",
    headers: authHeader,
  });
}

/** Farmer-only: accept or reject one of their own PENDING received
 * offers. */
export async function respondToProduceOffer(
  id: string,
  action: "ACCEPT" | "REJECT"
): Promise<ProduceOfferResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ProduceOffer>(`${BASE_PATH}/${id}/respond`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ action }),
  });
}

/** Fetches a single offer the caller is party to, as either the buyer who
 * made it or the farmer who received it. */
export async function fetchProduceOfferById(id: string): Promise<ProduceOfferResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<ProduceOffer>(`${BASE_PATH}/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

/** The backend's list response puts `pagination` alongside `data`, not
 * inside it (see produceOffer.controller.ts listMyOffers) — so the success
 * shape here extends ApiSuccess with that extra field rather than folding
 * it into ProduceOffer[]. Mirrors TransportBookingListApiSuccess in
 * lib/transportBooking.ts. */
export interface ProduceOfferListApiSuccess extends ApiSuccess<ProduceOffer[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ProduceOfferListApiBody = ProduceOfferListApiSuccess | ApiFailure;

interface ProduceOfferListApiResponse {
  status: number;
  body: ProduceOfferListApiBody;
}

type ProduceOfferListResultOrAuth = ProduceOfferListApiResponse | typeof AUTH_REQUIRED;

function buildListQueryString(filters: ProduceOfferListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.listingId) {
    params.set("listingId", filters.listingId);
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Lists the caller's own produce offers — sent, if called by a buyer;
 * received, if called by a farmer. Which side is returned is decided
 * server-side from the JWT's role claim, not by this function. */
export async function listMyProduceOffers(
  filters: ProduceOfferListFilters
): Promise<ProduceOfferListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<ProduceOffer[]>(
    `${BASE_PATH}?${query}`,
    { method: "GET", headers: authHeader }
  );

  // The raw JSON already has `pagination` on it (see the comment on
  // ProduceOfferListApiSuccess above) — apiRequestWithStatus just doesn't
  // know the type, so this cast reflects what the backend actually sends
  // rather than reshaping the response.
  return { status, body: body as ProduceOfferListApiBody };
}
