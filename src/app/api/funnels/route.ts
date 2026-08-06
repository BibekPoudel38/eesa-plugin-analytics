import { requireSite } from "@/lib/eesa/api";
import { listFunnels, createFunnel } from "@/lib/db/funnels";
import { validateGoalInput } from "@/lib/goals/compute";
import type { FunnelStepDef } from "@/lib/funnels/compute";

// Funnel definitions — list + create, tenant AND site scoped via requireSite.
export const dynamic = "force-dynamic";

/** Steps are validated with the SAME function goals use, so a funnel step and a
 *  conversion card can never accept different rules. */
export function parseStepsInput(
  raw: unknown,
): { ok: true; steps: FunnelStepDef[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "at least one step is required" };
  }
  if (raw.length > 12) {
    return { ok: false, error: "a funnel can have at most 12 steps" };
  }
  const steps: FunnelStepDef[] = [];
  for (let i = 0; i < raw.length; i++) {
    const o = (raw[i] ?? {}) as Record<string, unknown>;
    const label = String(o.label ?? "").trim();
    if (!label) return { ok: false, error: `step ${i + 1}: label is required` };
    const parsed = validateGoalInput({
      name: label,
      kind: o.kind,
      operator: o.operator,
      value: o.value,
    });
    if (!parsed.ok) return { ok: false, error: `step ${i + 1}: ${parsed.error}` };
    steps.push({
      label,
      kind: parsed.value.kind,
      operator: parsed.value.operator,
      value: parsed.value.value,
    });
  }
  return { ok: true, steps };
}

export async function GET(req: Request) {
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;
  return Response.json({ funnels: await listFunnels(scope.ctx.tenantId, scope.site.id) });
}

export async function POST(req: Request) {
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const parsed = parseStepsInput(body.steps);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const funnel = await createFunnel(
      scope.ctx.tenantId, scope.site.id, name, parsed.steps, scope.ctx.sub,
    );
    return Response.json({ funnel }, { status: 201 });
  } catch (e) {
    // unique (tenant_id, site_id, name)
    if ((e as { code?: string })?.code === "23505") {
      return Response.json(
        { error: `A funnel called “${name}” already exists for this site.` },
        { status: 409 },
      );
    }
    throw e;
  }
}
