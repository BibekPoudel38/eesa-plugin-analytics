import { NextResponse } from "next/server";
import { addRecordingChunk } from "@/lib/live/recordings";

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
  siteId: string;
  device: string;
  path: string;
  events: Record<string, unknown>[];
};

export async function POST(req: Request) {
  let body: RecBatch;
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }
  if (!body?.sessionId || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "Bad batch" }, { status: 422, headers: CORS });
  }
  const accepted = addRecordingChunk({
    sessionId: body.sessionId,
    siteId: body.siteId ?? "default",
    device: body.device ?? "Desktop",
    path: body.path ?? "/",
    events: body.events,
  });
  return NextResponse.json({ ok: true, accepted }, { status: 200, headers: CORS });
}
