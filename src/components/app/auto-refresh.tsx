"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Keeps the current server-rendered page fresh without a manual reload.
 * `router.refresh()` re-runs the route's server components (re-reading the live
 * store) and re-renders in place — client state and scroll are preserved.
 * Pauses while the tab is hidden so we don't poll a backgrounded dashboard.
 */
export function AutoRefresh({ intervalMs = 12000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(true);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    // refresh immediately when the tab regains focus
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [on, intervalMs, refresh]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        title={on ? "Auto-refresh on — click to pause" : "Auto-refresh paused — click to resume"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
          on
            ? "border-[var(--pine)]/25 bg-[var(--pine)]/10 text-[var(--pine)]"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="relative flex size-2">
          {on && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-pine opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex size-2 rounded-full",
              on ? "bg-pine" : "bg-muted-foreground/50",
            )}
          />
        </span>
        {on ? "Live" : "Paused"}
      </button>
      <button
        type="button"
        onClick={refresh}
        aria-label="Refresh now"
        title="Refresh now"
        className="grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <RefreshCw className={cn("size-4", pending && "animate-spin")} />
      </button>
    </div>
  );
}
