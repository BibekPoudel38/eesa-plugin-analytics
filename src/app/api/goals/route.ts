import { requireSite } from "@/lib/eesa/api";
import { listGoals, createGoal } from "@/lib/db/goals";
import { validateGoalInput } from "@/lib/goals/compute";

// Goal cards — list + create. Tenant AND site scoped: requireSite resolves
// `?site=` and 404s anything the caller's tenant does not own, so a goal can
// never be listed against, or attached to, another tenant's site.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;
  return Response.json({
    goals: await listGoals(scope.ctx.tenantId, scope.site.id),
  });
}

export async function POST(req: Request) {
  // Defining what the business counts as a conversion is an admin decision —
  // same bar as creating a site.
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const parsed = validateGoalInput(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const goal = await createGoal(
      scope.ctx.tenantId,
      scope.site.id,
      { ...parsed.value, icon: typeof body.icon === "string" ? body.icon : "" },
      scope.ctx.sub,
    );
    return Response.json({ goal }, { status: 201 });
  } catch (e) {
    // unique (tenant_id, site_id, name) — a duplicate name is a user mistake,
    // not a server fault, and the message has to say which name collided.
    if ((e as { code?: string })?.code === "23505") {
      return Response.json(
        { error: `A goal called “${parsed.value.name}” already exists for this site.` },
        { status: 409 },
      );
    }
    throw e;
  }
}
