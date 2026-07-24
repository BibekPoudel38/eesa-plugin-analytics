import { requireSite } from "@/lib/eesa/api";
import { getSessionDetail } from "@/lib/data";

// One session's detail, tenant+site scoped.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;
  const detail = await getSessionDetail(scope.ctx.tenantId, scope.site.id, id);
  if (!detail) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(detail);
}
