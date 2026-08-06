import "server-only";
import { query } from "./pool";
import type { FunnelStepDef } from "@/lib/funnels/compute";
import { validateGoalInput } from "@/lib/goals/compute";

/**
 * Funnel definitions — tenant + site scoped, same rules as goals.ts: every
 * function takes tenantId first and every statement filters on it.
 *
 * `steps` is stored as jsonb. Each step is a label plus a GoalRule, so a funnel
 * step and a conversion card speak the same language and are validated by the
 * same function.
 */

const COLS = "id, tenant_id, site_id, name, steps, created_by, created_at, updated_at";

interface Row {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  steps: unknown;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface StoredFunnel {
  id: string;
  siteId: string;
  name: string;
  steps: FunnelStepDef[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Coerce whatever is in jsonb into steps we can actually match with. A row
 *  written by an older shape must not crash the page — it renders as a funnel
 *  with fewer steps, which is visible, rather than a 500. */
export function parseSteps(raw: unknown): FunnelStepDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FunnelStepDef[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const parsed = validateGoalInput({
      name: o.label ?? "step",
      kind: o.kind,
      operator: o.operator,
      value: o.value,
    });
    if (!parsed.ok) continue;
    out.push({
      label: String(o.label ?? parsed.value.name),
      kind: parsed.value.kind,
      operator: parsed.value.operator,
      value: parsed.value.value,
    });
  }
  return out;
}

function map(r: Row): StoredFunnel {
  return {
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    steps: parseSteps(r.steps),
    createdBy: r.created_by ?? "",
    createdAt: (r.created_at ?? new Date()).toISOString(),
    updatedAt: (r.updated_at ?? new Date()).toISOString(),
  };
}

export async function listFunnels(
  tenantId: string,
  siteId: string,
): Promise<StoredFunnel[]> {
  const rows = await query<Row>(
    `select ${COLS} from funnels
      where tenant_id = $1 and site_id = $2
      order by created_at asc`,
    [tenantId, siteId],
  );
  return rows.map(map);
}

export async function createFunnel(
  tenantId: string,
  siteId: string,
  name: string,
  steps: FunnelStepDef[],
  createdBy: string,
): Promise<StoredFunnel> {
  const rows = await query<Row>(
    `insert into funnels (tenant_id, site_id, name, steps, created_by)
     values ($1, $2, $3, $4::jsonb, $5)
     returning ${COLS}`,
    [tenantId, siteId, name, JSON.stringify(steps), createdBy],
  );
  return map(rows[0]);
}

export async function updateFunnel(
  tenantId: string,
  siteId: string,
  id: string,
  patch: { name?: string; steps?: FunnelStepDef[] },
): Promise<StoredFunnel | null> {
  const sets: string[] = [];
  const params: unknown[] = [tenantId, siteId, id];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.steps !== undefined) {
    params.push(JSON.stringify(patch.steps));
    sets.push(`steps = $${params.length}::jsonb`);
  }
  if (!sets.length) return null;
  sets.push("updated_at = now()");
  const rows = await query<Row>(
    `update funnels set ${sets.join(", ")}
      where tenant_id = $1 and site_id = $2 and id = $3
      returning ${COLS}`,
    params,
  );
  return rows[0] ? map(rows[0]) : null;
}

export async function deleteFunnel(
  tenantId: string,
  siteId: string,
  id: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `delete from funnels where tenant_id = $1 and site_id = $2 and id = $3 returning id`,
    [tenantId, siteId, id],
  );
  return rows.length > 0;
}
