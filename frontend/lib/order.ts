import { ApiFailure, ApiSuccess, apiRequestWithStatus, ApiResponseWithStatus } from "./api";
import { getAuthHeader } from "./auth";
import { Order, OrderHistoryEntry, OrderListFilters } from "@/types";

const BASE_PATH = "/orders";

/** Sentinel returned when no JWT is present in sessionStorage, so callers
 * can short-circuit straight to an auth-required UI state instead of
 * firing a request the backend would reject with 401. Mirrors
 * lib/produceOffer.ts. */
export const AUTH_REQUIRED = "AUTH_REQUIRED" as const;

type OrderResult = ApiResponseWithStatus<Order> | typeof AUTH_REQUIRED;
type OrderHistoryResult = ApiResponseWithStatus<OrderHistoryEntry[]> | typeof AUTH_REQUIRED;

/** Fetches a single order the caller is party to, as either the buyer who
 * made it or the farmer who received it. */
export async function fetchOrderById(id: string): Promise<OrderResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<Order>(`${BASE_PATH}/${id}`, {
    method: "GET",
    headers: authHeader,
  });
}

/** Fetches the full status-change audit trail for one of the caller's own
 * orders, oldest first. */
export async function fetchOrderHistory(id: string): Promise<OrderHistoryResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<OrderHistoryEntry[]>(`${BASE_PATH}/${id}/history`, {
    method: "GET",
    headers: authHeader,
  });
}

/** Moves an order to its next status along the fixed forward path
 * (PENDING -> CONFIRMED -> READY -> PICKUP -> DELIVERED -> COMPLETED).
 * The backend decides the next status server-side — there is no
 * `status` field to pass, only an optional note. */
export async function advanceOrder(id: string, note?: string): Promise<OrderResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<Order>(`${BASE_PATH}/${id}/advance`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ note }),
  });
}

/** Cancels one of the caller's own orders. Only valid while the order is
 * still PENDING or CONFIRMED. */
export async function cancelOrder(id: string, reason?: string): Promise<OrderResult> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  return apiRequestWithStatus<Order>(`${BASE_PATH}/${id}/cancel`, {
    method: "PATCH",
    headers: authHeader,
    body: JSON.stringify({ reason }),
  });
}

/** The backend's list response puts `pagination` alongside `data`, not
 * inside it (see order.controller.ts listMyOrders) — so the success shape
 * here extends ApiSuccess with that extra field rather than folding it
 * into Order[]. Mirrors ProduceOfferListApiSuccess in lib/produceOffer.ts. */
export interface OrderListApiSuccess extends ApiSuccess<Order[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type OrderListApiBody = OrderListApiSuccess | ApiFailure;

interface OrderListApiResponse {
  status: number;
  body: OrderListApiBody;
}

type OrderListResultOrAuth = OrderListApiResponse | typeof AUTH_REQUIRED;

function buildListQueryString(filters: OrderListFilters): string {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }
  params.set("page", String(filters.page ?? 1));
  params.set("limit", String(filters.limit ?? 20));

  return params.toString();
}

/** Lists the caller's own orders — orders they've made, if called by a
 * buyer; orders received on their listings, if called by a farmer. Which
 * side is returned is decided server-side from the JWT's role claim, not
 * by this function. */
export async function listMyOrders(filters: OrderListFilters): Promise<OrderListResultOrAuth> {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    return AUTH_REQUIRED;
  }

  const query = buildListQueryString(filters);

  const { status, body } = await apiRequestWithStatus<Order[]>(`${BASE_PATH}?${query}`, {
    method: "GET",
    headers: authHeader,
  });

  // The raw JSON already has `pagination` on it (see the comment on
  // OrderListApiSuccess above) — apiRequestWithStatus just doesn't know
  // the type, so this cast reflects what the backend actually sends
  // rather than reshaping the response.
  return { status, body: body as OrderListApiBody };
}
