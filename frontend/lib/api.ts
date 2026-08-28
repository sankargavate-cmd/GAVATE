const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api/v1";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** Parsed body paired with the raw HTTP status, for callers that need to
 * branch on specific statuses (401 vs 404 vs 400) rather than just the
 * success/failure shape of the body. */
export interface ApiResponseWithStatus<T> {
  status: number;
  body: ApiResult<T>;
}

async function performRequest<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponseWithStatus<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  const body = (await res.json()) as ApiResult<T>;
  return { status: res.status, body };
}

/**
 * Thin wrapper around fetch for talking to the backend API.
 * Feature-specific calls (auth, farmers, schemes, etc.) should be added
 * as their own functions built on top of this once feature work begins.
 */
export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const { body } = await performRequest<T>(path, init);
  return body;
}

/**
 * Same as apiRequest, but also returns the raw HTTP status code alongside
 * the parsed body. Useful for callers (like the farmer profile flow) that
 * need to distinguish "not found" (404) from "unauthenticated" (401) from
 * other failures, since the JSON body alone doesn't carry the status.
 */
export async function apiRequestWithStatus<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponseWithStatus<T>> {
  return performRequest<T>(path, init);
}
