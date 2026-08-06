import { requireSite } from "@/lib/eesa/api";
import { updateFunnel, deleteFunnel } from "@/lib/db/funnels";
import { parseStepsInput } from "../route";
import type { FunnelStepDef } from "@/lib/funnels/compute";

// One funnel — rename, re-step, or remove. Scoped by (tenant, site, id).
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

  const patch: { name?: string; steps?: FunnelStepDef[] } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return Response.json({ error: "name is required" }, { status: 400 });
    patch.name = name;
  }
  if (body.steps !== undefined) {
    const parsed = parseStepsInput(body.steps);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    patch.steps = parsed.steps;
  }
  if (patch.name === undefined && patch.steps === undefined) {
    return Response.json({ error: "nothing to update" }, { status: 400 });
  }

  try {
    const funnel = await updateFunnel(scope.ctx.tenantId, scope.site.id, id, patch);
    if (!funnel) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ funnel });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      return Response.json(
        { error: "Another funnel on this site already uses that name." },
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
  const gone = await deleteFunnel(scope.ctx.tenantId, scope.site.id, id);
  if (!gone) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
