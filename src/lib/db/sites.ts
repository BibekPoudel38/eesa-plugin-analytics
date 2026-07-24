import "server-only";
import { randomBytes } from "node:crypto";
import { query } from "./pool";

/**
 * Sites — one tracked website/property per row ("add multiple servers").
 * Every function is tenant-scoped: tenant_id comes from the verified Eesa token,
 * never from client input. The one exception is {@link resolveTrackingKey},
 * which is the PUBLIC ingest lookup — it maps an unguessable key back to a
 * tenant/site and is the ONLY way the public plane learns a tenant id.
 */

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  domain: string;
  trackingKey: string;
  allowedOrigins: string[];
  recordReplay: boolean;
  maskInputs: boolean;
  status: "active" | "paused" | "disabled" | string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface SiteRow {
  id: string;
  tenant_id: string;
  name: string;
  domain: string;
  tracking_key: string;
  allowed_origins: string[];
  record_replay: boolean;
  mask_inputs: boolean;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapSite(r: SiteRow): Site {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    domain: r.domain,
    trackingKey: r.tracking_key,
    allowedOrigins: r.allowed_origins ?? [],
    recordReplay: r.record_replay,
    maskInputs: r.mask_inputs,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Public write key that goes in the snippet's `data-site`. Unguessable. */
export function generateTrackingKey(): string {
  return "chps_live_" + randomBytes(18).toString("base64url");
}

const COLS =
  "id, tenant_id, name, domain, tracking_key, allowed_origins, record_replay, mask_inputs, status, created_by, created_at, updated_at";

export async function listSites(tenantId: string): Promise<Site[]> {
  const rows = await query<SiteRow>(
    `select ${COLS} from sites where tenant_id = $1 order by created_at asc`,
    [tenantId],
  );
  return rows.map(mapSite);
}

export async function getSite(
  tenantId: string,
  siteId: string,
): Promise<Site | null> {
  const rows = await query<SiteRow>(
    `select ${COLS} from sites where tenant_id = $1 and id = $2`,
    [tenantId, siteId],
  );
  return rows[0] ? mapSite(rows[0]) : null;
}

export async function createSite(
  tenantId: string,
  input: { name: string; domain?: string; allowedOrigins?: string[] },
  createdBy: string,
): Promise<Site> {
  const rows = await query<SiteRow>(
    `insert into sites (tenant_id, name, domain, tracking_key, allowed_origins, created_by)
     values ($1, $2, $3, $4, $5, $6)
     returning ${COLS}`,
    [
      tenantId,
      input.name.trim() || "Untitled site",
      (input.domain ?? "").trim(),
      generateTrackingKey(),
      input.allowedOrigins ?? [],
      createdBy,
    ],
  );
  return mapSite(rows[0]);
}

export async function updateSite(
  tenantId: string,
  siteId: string,
  patch: Partial<
    Pick<
      Site,
      | "name"
      | "domain"
      | "allowedOrigins"
      | "recordReplay"
      | "maskInputs"
      | "status"
    >
  >,
): Promise<Site | null> {
  // Build a dynamic SET list from only the provided fields.
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };
  if (patch.name !== undefined) add("name", patch.name.trim());
  if (patch.domain !== undefined) add("domain", patch.domain.trim());
  if (patch.allowedOrigins !== undefined)
    add("allowed_origins", patch.allowedOrigins);
  if (patch.recordReplay !== undefined) add("record_replay", patch.recordReplay);
  if (patch.maskInputs !== undefined) add("mask_inputs", patch.maskInputs);
  if (patch.status !== undefined) add("status", patch.status);
  if (!sets.length) return getSite(tenantId, siteId);
  sets.push("updated_at = now()");
  vals.push(tenantId, siteId);
  const rows = await query<SiteRow>(
    `update sites set ${sets.join(", ")}
     where tenant_id = $${i++} and id = $${i}
     returning ${COLS}`,
    vals,
  );
  return rows[0] ? mapSite(rows[0]) : null;
}

export async function rotateTrackingKey(
  tenantId: string,
  siteId: string,
): Promise<Site | null> {
  const rows = await query<SiteRow>(
    `update sites set tracking_key = $1, updated_at = now()
     where tenant_id = $2 and id = $3
     returning ${COLS}`,
    [generateTrackingKey(), tenantId, siteId],
  );
  return rows[0] ? mapSite(rows[0]) : null;
}

export async function deleteSite(
  tenantId: string,
  siteId: string,
): Promise<boolean> {
  // Events for a deleted site age out via the retention policy; we drop the
  // site row (and its funnels/recordings via app logic) here.
  const rows = await query<{ id: string }>(
    `delete from sites where tenant_id = $1 and id = $2 returning id`,
    [tenantId, siteId],
  );
  return rows.length > 0;
}

/**
 * PUBLIC ingest resolution: tracking key → tenant/site, only for ACTIVE sites.
 * Returns null for unknown/disabled keys (caller should 202-and-drop, never
 * reveal which keys exist).
 */
export interface ResolvedSite {
  tenantId: string;
  siteId: string;
  allowedOrigins: string[];
  recordReplay: boolean;
  maskInputs: boolean;
}

export async function resolveTrackingKey(
  trackingKey: string,
): Promise<ResolvedSite | null> {
  if (!trackingKey || !trackingKey.startsWith("chps_")) return null;
  const rows = await query<{
    tenant_id: string;
    id: string;
    allowed_origins: string[];
    record_replay: boolean;
    mask_inputs: boolean;
  }>(
    `select tenant_id, id, allowed_origins, record_replay, mask_inputs
     from sites where tracking_key = $1 and status = 'active'`,
    [trackingKey],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    tenantId: r.tenant_id,
    siteId: r.id,
    allowedOrigins: r.allowed_origins ?? [],
    recordReplay: r.record_replay,
    maskInputs: r.mask_inputs,
  };
}

/**
 * Origin allowlist check for ingest. An empty allowlist means "any origin"
 * (convenient for local/dev); once a site lists origins, only those match.
 */
export function originAllowed(allowed: string[], origin: string): boolean {
  if (!allowed.length) return true;
  if (!origin) return false;
  return allowed.some((a) => a === origin || a === "*");
}
