import { NextResponse } from "next/server";
import { requireUi } from "@/lib/eesa/api";
import { parseCookies, SITE_COOKIE } from "@/lib/eesa/cookie";
import { getSessionDetail } from "@/lib/data";
import { analyzeSession } from "@/lib/analysis";

export const dynamic = "force-dynamic";

/**
 * AI-style analysis of a session, tenant+site scoped. Backed by the
 * deterministic placeholder in `@/lib/analysis`; swap for a Claude call later —
 * the response shape stays the same. The active site comes from the session
 * cookie (the detail page's client fetch carries no explicit site param).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const siteId = parseCookies(req.headers.get("cookie"))[SITE_COOKIE];
  if (!siteId) {
    return NextResponse.json({ error: "no active site" }, { status: 400 });
  }
  const session = await getSessionDetail(ctx.tenantId, siteId, id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(analyzeSession(session));
}
