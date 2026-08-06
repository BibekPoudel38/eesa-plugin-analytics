import "server-only";
import { query } from "./pool";
import type { Goal, GoalKind, GoalOperator } from "@/lib/goals/compute";

/**
 * Goals data layer — tenant + site scoped, mirroring `sites.ts`.
 *
 * EVERY function takes tenantId as its first argument and every statement
 * filters on it. That is the whole isolation model in this plugin (app-level,
 * per db/schema.sql), so a query that forgets it is a cross-tenant leak, not a
 * bug you notice later. There is deliberately no "get by id alone".
 */

const COLS =
  "id, tenant_id, site_id, name, kind, operator, value, icon, position, active, created_by, created_at, updated_at";

interface Row {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  kind: string;
  operator: string;
  value: string;
  icon: string;
  position: number;
  active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface StoredGoal extends Goal {
  siteId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function map(r: Row): StoredGoal {
  return {
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    kind: r.kind as GoalKind,
    operator: r.operator as GoalOperator,
    value: r.value,
    icon: r.icon ?? "",
    position: r.position ?? 0,
    active: r.active,
    createdBy: r.created_by ?? "",
    createdAt: (r.created_at ?? new Date()).toISOString(),
    updatedAt: (r.updated_at ?? new Date()).toISOString(),
  };
}

export async function listGoals(
  tenantId: string,
  siteId: string,
): Promise<StoredGoal[]> {
  const rows = await query<Row>(
    `select ${COLS} from goals
      where tenant_id = $1 and site_id = $2
      order by position asc, name asc`,
    [tenantId, siteId],
  );
  return rows.map(map);
}

export async function createGoal(
  tenantId: string,
  siteId: string,
  input: {
    name: string;
    kind: GoalKind;
    operator: GoalOperator;
    value: string;
    icon?: string;
  },
  createdBy: string,
): Promise<StoredGoal> {
  // Append to the end of the tenant's own card row. max()+1 rather than count()
  // so deleting a card can't collide two survivors onto one position.
  const rows = await query<Row>(
    `insert into goals (tenant_id, site_id, name, kind, operator, value, icon, position, created_by)
     values ($1, $2, $3, $4, $5, $6, $7,
             coalesce((select max(position) + 1 from goals where tenant_id = $1 and site_id = $2), 0),
             $8)
     returning ${COLS}`,
    [tenantId, siteId, input.name, input.kind, input.operator, input.value, input.icon ?? "", createdBy],
  );
  return map(rows[0]);
}

export async function updateGoal(
  tenantId: string,
  siteId: string,
  id: string,
  patch: Partial<{
    name: string;
    kind: GoalKind;
    operator: GoalOperator;
    value: string;
    icon: string;
    position: number;
    active: boolean;
  }>,
): Promise<StoredGoal | null> {
  const sets: string[] = [];
  const params: unknown[] = [tenantId, siteId, id];
  const add = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.name !== undefined) add("name", patch.name);
  if (patch.kind !== undefined) add("kind", patch.kind);
  if (patch.operator !== undefined) add("operator", patch.operator);
  if (patch.value !== undefined) add("value", patch.value);
  if (patch.icon !== undefined) add("icon", patch.icon);
  if (patch.position !== undefined) add("position", patch.position);
  if (patch.active !== undefined) add("active", patch.active);
  if (!sets.length) {
    const cur = await query<Row>(
      `select ${COLS} from goals where tenant_id = $1 and site_id = $2 and id = $3`,
      [tenantId, siteId, id],
    );
    return cur[0] ? map(cur[0]) : null;
  }
  sets.push("updated_at = now()");
  const rows = await query<Row>(
    `update goals set ${sets.join(", ")}
      where tenant_id = $1 and site_id = $2 and id = $3
      returning ${COLS}`,
    params,
  );
  return rows[0] ? map(rows[0]) : null;
}

export async function deleteGoal(
  tenantId: string,
  siteId: string,
  id: string,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `delete from goals where tenant_id = $1 and site_id = $2 and id = $3 returning id`,
    [tenantId, siteId, id],
  );
  return rows.length > 0;
}
