import { NextResponse } from "next/server";
import { resolveTrackingKey } from "@/lib/db/sites";
import { addRecordingChunk } from "@/lib/live/recordings";

/**
 * Public session-replay ingest — same trust model as /api/collect: the caller
 * proves nothing except knowledge of the site's public tracking key, which is
 * resolved server-side to (tenant, site).
 *
 * This endpoint used to accept every chunk and throw it away, with a note that
 * it must not write "un-partitioned replay data". That was the right call at
 * the time — the store keyed on session id alone and the read route had no auth
 * — but it meant replay had never worked: the recorder posted, got a 200, and
 * nothing was ever kept. Both halves are fixed now (see lib/live/recordings.ts
 * and ./[id]/route.ts), so chunks are stored under (tenant, site, session).
 *
 * THE TENANT AND SITE COME FROM THE RESOLVED KEY, never from the body. A client
 * that puts someone else's site id in `siteId` gets its own site's row, because
 * `siteId` on the wire IS the tracking key and is only ever used to look one up.
 */
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type RecBatch = {
  sessionId: string;
  siteId: string; // the tracking key
  device: string;
  path: string;
  events: Record<string, unknown>[];
};

/** Accept-and-drop. A tracker must never learn whether a key is real. */
function dropped() {
  return NextResponse.json({ ok: true, accepted: 0 }, { status: 202, headers: CORS });
}

export async function POST(req: Request) {
  let body: RecBatch;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }
  if (!body?.sessionId || !Array.isArray(body.events) || typeof body.siteId !== "string") {
    return NextResponse.json({ error: "Bad batch" }, { status: 422, headers: CORS });
  }

  const site = await resolveTrackingKey(body.siteId);
  // Unknown key, or replay not enabled for this site (privacy default is off,
  // per db/schema.sql). Answer exactly as if it were accepted — a differing
  // response would turn this endpoint into a key oracle.
  if (!site || !site.recordReplay) return dropped();

  const accepted = await addRecordingChunk({
    tenantId: site.tenantId,
    siteId: site.siteId,
    sessionId: String(body.sessionId),
    device: String(body.device ?? "Desktop"),
    path: String(body.path ?? "/"),
    events: body.events,
  });

  return NextResponse.json({ ok: true, accepted }, { status: 200, headers: CORS });
}
