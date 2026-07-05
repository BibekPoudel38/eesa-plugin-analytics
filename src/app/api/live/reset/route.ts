import { NextResponse } from "next/server";
import { clearEvents } from "@/lib/live/store";
import { clearRecordings } from "@/lib/live/recordings";

export const dynamic = "force-dynamic";

/** Clears all captured events + replays — used by the "Reset" control. */
export function POST() {
  clearEvents();
  clearRecordings();
  return NextResponse.json({ ok: true });
}
