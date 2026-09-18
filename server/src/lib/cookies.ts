// Issue 63 — minimal cookie parse/serialize, hand-rolled specifically to
// avoid adding the `cookie`/`cookie-parser` dependency for one cookie
// (docs/lab-03/specification.md §11 Assumptions).

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export interface CookieOptions {
  maxAgeSeconds?: number; // omit to make it a session cookie that expires on clear
  expiresNow?: boolean; // true clears the cookie (Max-Age=0)
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  if (options.expiresNow) {
    parts.push("Max-Age=0");
  } else if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }
  return parts.join("; ");
}
