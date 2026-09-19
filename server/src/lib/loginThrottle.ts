// Issue 63 — login throttle (docs/lab-03/specification.md BR-06). A
// temporary, in-memory, per-email throttle: 5 failed attempts within 15
// minutes blocks further attempts until the window passes. This is
// deliberately not a persisted account lock — it needs no administrator
// action to clear, since account unlocking is out of scope (§4.2) — so a
// single in-process Map is an intentional, documented scope limit for a
// course lab (see specification.md §9 "Known Limitations").
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

// Returns the seconds to wait if this email is currently throttled, or
// null if the attempt may proceed.
export function checkThrottle(email: string): number | null {
  const bucket = buckets.get(key(email));
  if (!bucket) return null;
  const elapsed = Date.now() - bucket.windowStart;
  if (elapsed >= WINDOW_MS) {
    buckets.delete(key(email));
    return null;
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return Math.ceil((WINDOW_MS - elapsed) / 1000);
  }
  return null;
}

export function recordFailedAttempt(email: string): void {
  const k = key(email);
  const existing = buckets.get(k);
  const now = Date.now();
  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    buckets.set(k, { count: 1, windowStart: now });
  } else {
    existing.count += 1;
  }
}

export function resetThrottle(email: string): void {
  buckets.delete(key(email));
}

// Test-only escape hatch so one test file's throttling never bleeds into
// another's (server/tests share one process — see tests.md §9).
export function resetAllThrottles(): void {
  buckets.clear();
}
