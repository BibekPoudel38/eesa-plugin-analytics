import { NextResponse } from "next/server";
import { ingest } from "@/lib/live/store";
import type { Batch } from "@/lib/live/types";

// Always run dynamically — this is a write endpoint.
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

function isValid(b: unknown): b is Batch {
  if (!b || typeof b !== "object") return false;
  const batch = b as Partial<Batch>;
  return (
    !!batch.meta &&
    typeof batch.meta === "object" &&
    typeof batch.meta.siteId === "string" &&
    Array.isArray(batch.events)
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    // sendBeacon posts as text; fetch posts JSON — handle both.
    const text = await req.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (!isValid(body)) {
    return NextResponse.json({ error: "Bad batch" }, { status: 422, headers: CORS });
  }

  // guard against absurd payloads
  const batch = body as Batch;
  if (batch.events.length > 500) batch.events = batch.events.slice(0, 500);

  const accepted = ingest(batch);
  return NextResponse.json({ ok: true, accepted }, { status: 200, headers: CORS });
}
