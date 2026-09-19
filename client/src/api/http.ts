const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Issue 64 — shared fetch wrapper (api-spec.md §0). Every request carries
// the session cookie (`credentials: "include"`) instead of the old
// Lab 2 development-requester header. AuthContext registers itself as the
// unauthorized handler so a 401 from *any* API call (not just a stale
// page load) immediately clears the cached identity and the route guard
// takes it from there — no manual redirect logic scattered per-call.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
  } catch {
    throw new Error("Unable to connect to TokTickIT API. Please try again.");
  }
  if (res.status === 401) {
    unauthorizedHandler?.();
  }
  return res;
}
