import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Eesa downstream-token verification — the authenticated (dashboard/agent)
 * plane. Ported from eesa-plugin-documents / eesa-plugin-attendance `src/auth.js`
 * to TypeScript; same trust model:
 *
 *   • Eesa mints a short-lived RS256 JWT whose `aud` == this plugin's slug.
 *   • We verify it OFFLINE against Eesa's public JWKS (by `kid`) — no callback.
 *   • `tenant_id` comes ONLY from the token's `tenantId` claim, never a client
 *     input. Every DB query is scoped by it.
 *
 * The PUBLIC ingest plane (chups.js → /api/collect) does NOT use this — those
 * requests carry no Eesa token and are authenticated by a site tracking key.
 */

const AUDIENCE = "analytics"; // MUST equal manifest.slug
const ISSUER = process.env.EESA_TOKEN_ISSUER || "eesa";

// Lazily built so a missing env at import time doesn't crash unrelated routes.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks() {
  if (_jwks) return _jwks;
  const url = process.env.EESA_JWKS_URL;
  if (!url) throw new AuthError("EESA_JWKS_URL is not set", 500);
  _jwks = createRemoteJWKSet(new URL(url));
  return _jwks;
}

export type Surface = "ui" | "mcp";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** The verified caller. `tenantId` and `sub` drive every tenant-scoped query. */
export interface PluginContext {
  sub: string; // Eesa user id, or "gateway" for service tokens
  tenantId: string;
  scopes: string[];
  surface: Surface | string;
  email?: string;
  role?: string; // platform role (UI-session tokens)
  appRole?: string; // Eesa-authoritative app role, read-only
  employeeRef?: string; // acting user on gateway/MCP service tokens
  raw: JWTPayload;
}

/** Pull the bearer token out of an Authorization header. */
export function bearer(authorization: string | null | undefined): string {
  if (!authorization) throw new AuthError("missing Authorization header");
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthError("malformed Authorization header");
  }
  return token;
}

/**
 * Verify an Eesa downstream JWT from an Authorization header value. Throws
 * {@link AuthError} on any failure.
 * @param expectedSurface when set, the token's `surface` claim must match.
 */
export async function verify(
  authorization: string | null | undefined,
  opts: { expectedSurface?: Surface } = {},
): Promise<PluginContext> {
  return verifyToken(bearer(authorization), opts);
}

/** Verify a raw JWT string (already extracted from header or cookie). */
export async function verifyToken(
  token: string,
  opts: { expectedSurface?: Surface } = {},
): Promise<PluginContext> {
  if (!token) throw new AuthError("missing token");

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      requiredClaims: ["exp", "aud"],
    }));
  } catch (e) {
    throw new AuthError(`token verification failed: ${(e as Error).message}`);
  }

  const tenantId =
    (payload.tenantId as string | undefined) ??
    (payload["tenant_id"] as string | undefined);
  if (!tenantId) throw new AuthError("token missing tenantId");

  const surface = (payload.surface as string | undefined) ?? "";
  if (opts.expectedSurface && surface !== opts.expectedSurface) {
    throw new AuthError(
      `token surface "${surface}" != expected "${opts.expectedSurface}"`,
      403,
    );
  }

  return {
    sub: (payload.sub as string) ?? "",
    tenantId,
    scopes: Array.isArray(payload.scopes) ? (payload.scopes as string[]) : [],
    surface,
    email: payload.email as string | undefined,
    role: payload.role as string | undefined,
    appRole: payload.appRole as string | undefined,
    employeeRef: payload.employeeRef as string | undefined,
    raw: payload,
  };
}

/**
 * Constant-time-ish check of the gateway shared secret. Required on the MCP
 * surface (the platform sends `X-Eesa-Gateway-Secret` when the connection is
 * gatewayOnly). Skipped for UI tokens, which come straight from the browser.
 */
export function requireGateway(header: string | null | undefined): void {
  const expected = process.env.PLUGIN_GATEWAY_SECRET || "";
  if (!expected) return; // not configured → don't enforce (dev)
  if (!header || header.length !== expected.length) {
    throw new AuthError("gateway secret mismatch", 403);
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  }
  if (diff !== 0) throw new AuthError("gateway secret mismatch", 403);
}

export function hasScope(ctx: PluginContext, scope: string): boolean {
  return ctx.scopes.includes(scope);
}
