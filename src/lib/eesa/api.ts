import "server-only";
import { verifyToken, AuthError, type PluginContext } from "./auth";
import { tokenFromRequest } from "./cookie";
import { getSite, type Site } from "@/lib/db/sites";

/**
 * Shared glue for the authenticated dashboard data endpoints.
 *
 * Verifies the Eesa UI-session token, then (optionally) resolves the requested
 * `?site=` and confirms it belongs to the caller's tenant. A site the tenant
 * doesn't own returns 404 — never another tenant's data.
 *
 * Dev bypass: when ALLOW_DEV_AUTH=1 AND no bearer token is present, a fake
 * context using DEV_TENANT_ID is returned so the app is runnable standalone
 * (local dev) without the Eesa platform. Strictly off unless that env is set.
 */

function devContext(): PluginContext | null {
  if (process.env.ALLOW_DEV_AUTH !== "1") return null;
  const tenantId = process.env.DEV_TENANT_ID || "dev-tenant";
  return {
    sub: "dev-user",
    tenantId,
    scopes: ["analytics:read", "analytics:write", "analytics:admin"],
    surface: "ui",
    role: "ADMIN",
    raw: {},
  };
}

export async function requireUi(req: Request): Promise<PluginContext | Response> {
  // Token from the Authorization header OR the partitioned session cookie the
  // shell's bridge set (client fetches replay the cookie automatically).
  const token = tokenFromRequest(req);
  if (!token) {
    const dev = devContext();
    if (dev) return dev;
    return Response.json({ error: "missing token" }, { status: 401 });
  }
  try {
    return await verifyToken(token, { expectedSurface: "ui" });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return Response.json({ error: (e as Error).message }, { status });
  }
}

export interface SiteScope {
  ctx: PluginContext;
  site: Site;
}

/** Verify the UI token AND resolve the `?site=` under the tenant. */
export async function requireSite(
  req: Request,
): Promise<SiteScope | Response> {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;
  const siteId = new URL(req.url).searchParams.get("site") || "";
  if (!siteId) {
    return Response.json({ error: "missing site" }, { status: 400 });
  }
  const site = await getSite(ctx.tenantId, siteId);
  if (!site) {
    return Response.json({ error: "site not found" }, { status: 404 });
  }
  return { ctx, site };
}

export function rangeParam(req: Request): string | undefined {
  return new URL(req.url).searchParams.get("range") || undefined;
}
