import { NextResponse } from "next/server";
import { getRecording } from "@/lib/live/recordings";

export const dynamic = "force-dynamic";

/** Returns the rrweb event stream for a session, consumed by the player. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const rec = getRecording(id);
  if (!rec) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // chunks can arrive out of order (async POSTs); rrweb needs strict time order
  // with Meta/FullSnapshot first, so sort by event timestamp before replay.
  const events = [...rec.events].sort(
    (a, b) => ((a.timestamp as number) ?? 0) - ((b.timestamp as number) ?? 0),
  );
  return NextResponse.json({
    sessionId: rec.sessionId,
    device: rec.device,
    page: rec.page,
    firstTs: rec.firstTs,
    lastTs: rec.lastTs,
    events,
  });
}
