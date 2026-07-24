"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

type Summary = {
  live: boolean;
  eventCount: number;
  visitors: number;
  sessions: number;
  recent: { ts: number }[];
};

function ago(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/**
 * Compact capture-health widget pinned to the foot of the sidebar. Tells an
 * internal operator, at a glance, whether tracking is alive and how fresh it
 * is — no billing, no quota. Polls the same live summary the Install screen uses.
 */
export function SidebarCapture({
  siteId,
  domain,
}: {
  siteId: string | null;
  domain: string | null;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [now, setNow] = useState(0);

  const poll = useCallback(async () => {
    if (!siteId) return;
    try {
      const res = await fetch(`/api/data/status?site=${encodeURIComponent(siteId)}`, {
        cache: "no-store",
      });
      if (res.ok) setData(await res.json());
      setNow(Date.now());
    } catch {
      /* ignore transient errors */
    }
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll, siteId]);

  const live = !!data?.live && (data?.eventCount ?? 0) > 0;
  const lastTs = data?.recent?.[0]?.ts;

  return (
    <div className="rounded-xl border border-sidebar-border bg-card/70 p-3.5 shadow-[var(--shadow-card)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="relative flex size-2">
            {live && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-pine opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                live ? "bg-pine" : "bg-muted-foreground/50",
              )}
            />
          </span>
          <span
            className={cn(
              "text-sm font-semibold",
              live ? "text-[var(--pine)]" : "text-muted-foreground",
            )}
          >
            {live ? "Live" : "Idle"}
          </span>
        </span>
        <span className="tabular font-mono text-[0.68rem] text-muted-foreground">
          {(data?.eventCount ?? 0).toLocaleString()} events
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <span
          className={cn(
            "truncate font-mono text-xs",
            domain ? "text-foreground" : "text-muted-foreground",
          )}
          title={domain ?? undefined}
        >
          {domain ?? "No site yet"}
        </span>
        {domain && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[0.58rem] font-medium uppercase tracking-wide",
              live
                ? "bg-[var(--pine)]/12 text-[var(--pine)]"
                : "bg-muted text-muted-foreground",
            )}
          >
            Live
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">
        {live && lastTs ? `Last event ${ago(lastTs, now)}` : "Waiting for events…"}
      </p>
    </div>
  );
}
