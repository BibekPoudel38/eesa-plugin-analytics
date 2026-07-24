import { compactNumber } from "@/lib/format";

/** Tells the viewer whether a screen is showing real captured data or the
 * seeded demo set — so live numbers are never mistaken for a canned mockup. */
export function DataBadge({
  live,
  eventCount,
}: {
  live: boolean;
  eventCount?: number;
}) {
  if (live) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--pine)]/25 bg-[var(--pine)]/10 px-3 py-1.5 text-sm shadow-[var(--shadow-card)]">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-pine opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-pine" />
        </span>
        <span className="font-medium text-[var(--pine)]">Live</span>
        {eventCount != null && (
          <span className="tabular font-mono text-xs text-[var(--pine)]/80">
            {compactNumber(eventCount)} events
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm shadow-[var(--shadow-card)]">
      <span className="size-2 rounded-full bg-muted-foreground/50" />
      <span className="font-mono text-xs text-muted-foreground">Demo data</span>
    </span>
  );
}
