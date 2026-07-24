import { NextResponse } from "next/server";
import { resolveTrackingKey } from "@/lib/db/sites";

// Public session-replay ingest — same trust model as /api/collect (keyed by the
// site tracking key). Full blob storage (MinIO/S3) lands in P4; until then this
// resolves the key and gates on the site's record_replay flag, dropping
// everything else so no un-partitioned replay data is ever written.
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
  // Drop if the key is unknown OR replay isn't enabled for this site (privacy
  // default is off). No storage backend is wired until P4, so accept-and-drop.
  if (!site || !site.recordReplay) return dropped();

  // TODO(P4): persist chunks to MinIO/S3 keyed by (tenant, site, session) and
  // upsert a pointer row in `recordings`. Intentionally not storing yet.
  return NextResponse.json({ ok: true, accepted: 0, pending: true }, { status: 200, headers: CORS });
}
