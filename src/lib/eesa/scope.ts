import "server-only";
import { cookies } from "next/headers";
import { verifyToken } from "./auth";
import { AT_COOKIE, SITE_COOKIE } from "./cookie";
import { listSites, type Site } from "@/lib/db/sites";

/**
 * Resolve the current dashboard scope for a SERVER COMPONENT from the session
 * cookies the bridge set. Returns:
 *   • authed=false when there's no valid Eesa token yet (render a connecting
 *     state; the client bridge will set the cookie and refresh);
 *   • authed=true with the tenant's sites and the active site (from the
 *     `eesa_site` cookie, else the first site, else null when none exist yet).
 */
export interface Scope {
  authed: boolean;
  tenantId: string;
  sites: Site[];
  site: Site | null;
}

const UNAUTHED: Scope = { authed: false, tenantId: "", sites: [], site: null };

export async function currentScope(): Promise<Scope> {
  const jar = await cookies();
  let tenantId: string | null = null;

  const token = jar.get(AT_COOKIE)?.value;
  if (token) {
    try {
      const ctx = await verifyToken(token, { expectedSurface: "ui" });
      tenantId = ctx.tenantId;
    } catch {
      tenantId = null;
    }
  }
  if (!tenantId && process.env.ALLOW_DEV_AUTH === "1") {
    tenantId = process.env.DEV_TENANT_ID || "dev-tenant";
  }
  if (!tenantId) return UNAUTHED;

  const sites = await listSites(tenantId);
  const activeId = jar.get(SITE_COOKIE)?.value;
  const site =
    (activeId ? sites.find((s) => s.id === activeId) : undefined) ??
    sites[0] ??
    null;

  return { authed: true, tenantId, sites, site };
}
