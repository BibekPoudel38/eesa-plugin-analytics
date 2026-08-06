import { requireSite } from "@/lib/eesa/api";
import { updateGoal, deleteGoal } from "@/lib/db/goals";
import { validateGoalInput, GOAL_OPERATORS, type GoalOperator } from "@/lib/goals/compute";

// One goal card — edit or remove. Every statement underneath is scoped by
// (tenant, site, id), so a known id from another tenant resolves to nothing.
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const patch: Parameters<typeof updateGoal>[3] = {};

  // A rule change is revalidated as a whole. Patching `kind` to "event" while
  // leaving a stale "contains" operator behind would store a rule that reads
  // as a partial event-name match — which the matcher does not honour, so the
  // card would silently disagree with what the editor shows.
  if (body.name !== undefined || body.kind !== undefined || body.value !== undefined || body.operator !== undefined) {
    const parsed = validateGoalInput({
      name: body.name ?? "placeholder",
      kind: body.kind,
      operator: body.operator,
      value: body.value ?? "placeholder",
    });
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    if (body.name !== undefined) patch.name = parsed.value.name;
    if (body.value !== undefined) patch.value = parsed.value.value;
    if (body.kind !== undefined) {
      patch.kind = parsed.value.kind;
      patch.operator = parsed.value.operator; // pinned to "exact" for events
    } else if (body.operator !== undefined) {
      const op = String(body.operator).toLowerCase() as GoalOperator;
      if (!GOAL_OPERATORS.includes(op)) {
        return Response.json({ error: "invalid operator" }, { status: 400 });
      }
      patch.operator = op;
    }
  }
  if (typeof body.icon === "string") patch.icon = body.icon;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    patch.position = Math.max(0, Math.round(body.position));
  }

  try {
    const goal = await updateGoal(scope.ctx.tenantId, scope.site.id, id, patch);
    if (!goal) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ goal });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      return Response.json(
        { error: "Another goal on this site already uses that name." },
        { status: 409 },
      );
    }
    throw e;
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;
  const gone = await deleteGoal(scope.ctx.tenantId, scope.site.id, id);
  if (!gone) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
