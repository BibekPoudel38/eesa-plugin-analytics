"use client";

import { useEffect, useState, useCallback } from "react";
import { RotateCcw, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type Summary = {
  live: boolean;
  eventCount: number;
  visitors: number;
  sessions: number;
  recent: { type: string; path: string; label: string; ts: number }[];
};

const typeTone: Record<string, string> = {
  pageview: "text-teal",
  click: "text-foreground",
  rageclick: "text-ember",
  deadclick: "text-ember",
  scroll: "text-muted-foreground",
  custom: "text-pine",
  session_end: "text-muted-foreground",
};

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function LiveStatus() {
  const [data, setData] = useState<Summary | null>(null);
  const [now, setNow] = useState(0);
  const [resetting, setResetting] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/live/summary", { cache: "no-store" });
      if (res.ok) setData(await res.json());
      setNow(Date.now());
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2500);
    return () => clearInterval(id);
  }, [poll]);

  async function reset() {
    setResetting(true);
    try {
      await fetch("/api/live/reset", { method: "POST" });
      await poll();
    } finally {
      setResetting(false);
    }
  }

  const stats = [
    { label: "Events", value: data?.eventCount ?? 0 },
    { label: "Visitors", value: data?.visitors ?? 0 },
    { label: "Sessions", value: data?.sessions ?? 0 },
  ];
  const capturing = (data?.eventCount ?? 0) > 0;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Capture status</h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
            capturing
              ? "bg-[var(--pine)]/12 text-[var(--pine)]"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span className="relative flex size-2">
            {capturing && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-pine opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                capturing ? "bg-pine" : "bg-muted-foreground/50",
              )}
            />
          </span>
          {capturing ? "Receiving events" : "Waiting for first event"}
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {stats.map((s) => (
          <div key={s.label} className="px-5 py-4">
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
              {s.label}
            </div>
            <div className="tabular mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
              {s.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-[180px] flex-1 p-2">
        {data?.recent.length ? (
          <ul className="divide-y divide-border/60">
            {data.recent.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span
                  className={cn(
                    "w-24 shrink-0 font-mono text-xs font-medium",
                    typeTone[e.type] ?? "text-foreground",
                  )}
                >
                  {e.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {e.label}
                </span>
                <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">
                  {e.path}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[0.7rem] text-muted-foreground">
                  {ago(e.ts, now)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid h-[180px] place-items-center px-6 text-center text-sm text-muted-foreground">
            No events yet. Add the snippet to Mom2Mom, then click around the
            site — events land here within a few seconds.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          Auto-refreshing every 2.5s
        </span>
        <button
          onClick={reset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className={cn("size-3.5", resetting && "animate-spin")} />
          Reset data
        </button>
      </div>
    </div>
  );
}
