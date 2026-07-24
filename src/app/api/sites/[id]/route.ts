import { requireUi } from "@/lib/eesa/api";
import { updateSite, deleteSite } from "@/lib/db/sites";

// Update / delete a single site. Tenant-scoped.
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const site = await updateSite(ctx.tenantId, id, {
    name: typeof body.name === "string" ? body.name : undefined,
    domain: typeof body.domain === "string" ? body.domain : undefined,
    allowedOrigins: Array.isArray(body.allowedOrigins)
      ? (body.allowedOrigins as string[])
      : undefined,
    recordReplay:
      typeof body.recordReplay === "boolean" ? body.recordReplay : undefined,
    maskInputs:
      typeof body.maskInputs === "boolean" ? body.maskInputs : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
  });
  if (!site) return Response.json({ error: "site not found" }, { status: 404 });
  return Response.json({ site });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const ok = await deleteSite(ctx.tenantId, id);
  if (!ok) return Response.json({ error: "site not found" }, { status: 404 });
  return Response.json({ ok: true });
}
