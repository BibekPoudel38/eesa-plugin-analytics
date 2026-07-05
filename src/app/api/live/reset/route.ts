import { NextResponse } from "next/server";
import { clearEvents } from "@/lib/live/store";

export const dynamic = "force-dynamic";

/** Clears all captured events — used by the "Reset" control on Install. */
export function POST() {
  clearEvents();
  return NextResponse.json({ ok: true });
}
