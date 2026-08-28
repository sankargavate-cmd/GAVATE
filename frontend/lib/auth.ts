// sessionStorage is used (not localStorage) so the JWT is cleared as soon
// as the tab/browser is closed, rather than persisting indefinitely.
const TOKEN_STORAGE_KEY = "shetkari-sathi:access-token";

/**
 * Reads the JWT access token from sessionStorage. Returns null on the
 * server (SSR/build) or when no token has been stored yet — callers treat
 * a null token as "not authenticated".
 */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

/** Builds the `Authorization: Bearer <token>` header, or null if no token
 * is currently stored. */
export function getAuthHeader(): { Authorization: string } | null {
  const token = getStoredToken();
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

/**
 * Reads the `role` claim out of the stored JWT's payload, without
 * verifying the signature — the backend is the actual source of truth for
 * every protected request (requireAuth/requireRole re-verify server-side
 * every time). This is purely for client-side UX: deciding which
 * dashboard to redirect to after login, and which nav/route to show,
 * before any API call has round-tripped. Returns null if there's no
 * token, or if it's malformed.
 */
export function getStoredRole(): string | null {
  const token = getStoredToken();
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}
