import { NextResponse } from "next/server";
import { getLiveStatus } from "@/lib/data";
import { allEvents } from "@/lib/live/store";

export const dynamic = "force-dynamic";

/** Polled by the Install screen to show capture status in real time. */
export function GET() {
  const status = getLiveStatus();
  const recent = [...allEvents()]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map((e) => ({
      type: e.type,
      path: e.path,
      label: e.text || e.target || e.name || e.path,
      ts: e.ts,
    }));
  return NextResponse.json({ ...status, recent });
}
