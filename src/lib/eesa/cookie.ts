/**
 * Session cookies for the embedded dashboard.
 *
 * The plugin is framed cross-site by the Eesa shell, so the session cookie must
 * be `SameSite=None; Secure; Partitioned` (CHIPS) to be allowed in that
 * third-party context on Chromium. It is HttpOnly — the Eesa token never
 * touches page JS; the browser simply replays the cookie (within the eesa.ai
 * partition) on every same-origin request the iframe makes, so both server
 * components and client fetches authenticate with zero token handling.
 *
 * In dev (NODE_ENV !== production) we drop Secure/Partitioned so the cookie
 * works on http://localhost while running standalone.
 */

export const AT_COOKIE = "eesa_at"; // the Eesa UI-session JWT
export const SITE_COOKIE = "eesa_site"; // the active site id

const PROD = process.env.NODE_ENV === "production";

/** Parse a Cookie header into a map. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** The token the request carries: Authorization bearer wins, else the cookie. */
export function tokenFromRequest(req: Request): string | null {
  const authz = req.headers.get("authorization");
  if (authz) {
    const [scheme, token] = authz.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }
  const cookies = parseCookies(req.headers.get("cookie"));
  return cookies[AT_COOKIE] ?? null;
}

/** Build a Set-Cookie header value with the right cross-site attributes. */
export function buildSetCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (PROD) {
    parts.push("SameSite=None", "Secure", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  return parts.join("; ");
}
