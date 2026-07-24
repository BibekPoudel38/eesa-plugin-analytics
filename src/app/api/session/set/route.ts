import { verifyToken, AuthError } from "@/lib/eesa/auth";
import { AT_COOKIE, SITE_COOKIE, buildSetCookie } from "@/lib/eesa/cookie";

/**
 * The client bridge POSTs here with the Eesa UI-session token it received over
 * the postMessage handshake (and/or a newly-selected active site). We verify the
 * token and set it as the partitioned session cookie so every subsequent request
 * — server render or client fetch — is authenticated by the browser replaying
 * the cookie. The token is never stored in page-readable JS.
 */
export const dynamic = "force-dynamic";

// UI-session tokens are short-lived (≤15m); refresh the cookie for a working
// window and let the bridge re-set it when the shell sends a fresh token.
const MAX_AGE = 15 * 60;
const SITE_MAX_AGE = 30 * 24 * 60 * 60;

export async function POST(req: Request) {
  let body: { token?: string; site?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const setCookies: string[] = [];
  let tenantOk = false;

  if (body.token) {
    try {
      await verifyToken(body.token, { expectedSurface: "ui" });
      setCookies.push(buildSetCookie(AT_COOKIE, body.token, MAX_AGE));
      tenantOk = true;
    } catch (e) {
      const status = e instanceof AuthError ? e.status : 401;
      return Response.json({ error: (e as Error).message }, { status });
    }
  }

  if (typeof body.site === "string" && body.site) {
    setCookies.push(buildSetCookie(SITE_COOKIE, body.site, SITE_MAX_AGE));
  }

  if (!setCookies.length) {
    return Response.json({ error: "nothing to set" }, { status: 400 });
  }

  const res = Response.json({ ok: true, authed: tenantOk });
  for (const c of setCookies) res.headers.append("Set-Cookie", c);
  return res;
}
