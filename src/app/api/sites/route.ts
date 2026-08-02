import { requireUi } from "@/lib/eesa/api";
import { listSites, createSite } from "@/lib/db/sites";

// Site management — list + create. Tenant-scoped from the verified UI token.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;
  return Response.json({ sites: await listSites(ctx.tenantId) });
}

export async function POST(req: Request) {
  const ctx = await requireUi(req, { role: "admin" });
  if (ctx instanceof Response) return ctx;
  let body: { name?: string; domain?: string; allowedOrigins?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body?.name || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const site = await createSite(
    ctx.tenantId,
    {
      name: body.name,
      domain: body.domain,
      allowedOrigins: Array.isArray(body.allowedOrigins)
        ? body.allowedOrigins
        : undefined,
    },
    ctx.sub,
  );
  return Response.json({ site }, { status: 201 });
}
