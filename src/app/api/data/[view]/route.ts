import { requireUi, requireSite, rangeParam } from "@/lib/eesa/api";
import {
  getLiveStatus,
  getOverview,
  getHeatData,
  getSessionsData,
  getVisitorsData,
  getFunnelsData,
} from "@/lib/data";

// Authenticated dashboard data. Every view is tenant+site scoped from the
// verified Eesa UI token — the client fetches these with the Bearer token the
// postMessage bridge handed it. Always dynamic (per-request auth + live data).
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ view: string }> },
) {
  const { view } = await params;

  // Tenant-level: lists sites + headline "is anything live". Site optional.
  if (view === "status") {
    const ctx = await requireUi(req);
    if (ctx instanceof Response) return ctx;
    const siteId = new URL(req.url).searchParams.get("site") || undefined;
    return Response.json(await getLiveStatus(ctx.tenantId, siteId));
  }

  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;
  const { ctx, site } = scope;
  const range = rangeParam(req);
  const t = ctx.tenantId;

  switch (view) {
    case "overview":
      return Response.json(await getOverview(t, site.id, range));
    case "heat":
      return Response.json(await getHeatData(t, site.id, range));
    case "sessions":
      return Response.json(await getSessionsData(t, site.id, range));
    case "visitors":
      return Response.json(await getVisitorsData(t, site.id, range));
    case "funnels":
      return Response.json(await getFunnelsData(t, site.id, range));
    default:
      return Response.json({ error: "unknown view" }, { status: 404 });
  }
}
