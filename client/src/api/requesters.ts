const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface DevRequester {
  id: number;
  fullName: string;
  email: string;
}

// Issue 25 — GET /api/dev-requesters (api-spec.md §3). Unauthenticated;
// only active Development Requesters come back (BR-06).
export async function fetchActiveRequesters(): Promise<DevRequester[]> {
  const res = await fetch(`${API_URL}/api/dev-requesters`);
  if (!res.ok) {
    throw new Error("Unable to load Development Requesters.");
  }
  return res.json();
}
