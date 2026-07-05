import { cn } from "@/lib/utils";
import { HeatOverlay, WireframePage } from "@/components/charts/heat-canvas";
import type { HeatPage } from "@/lib/mock/data";
import { Lock, Monitor, Smartphone } from "lucide-react";

export type HeatMode = "click" | "attention" | "scroll";

function heatColor(reach: number) {
  if (reach >= 90) return "var(--heat-4)";
  if (reach >= 70) return "var(--heat-3)";
  if (reach >= 50) return "var(--heat-2)";
  if (reach >= 35) return "var(--heat-1)";
  return "var(--heat-0)";
}

/** Scroll-depth map: bands cool as fewer visitors reach that depth. */
function ScrollOverlay({ page }: { page: HeatPage }) {
  const depths = ["0%", "25%", "50%", "75%", "100%"];
  return (
    <div className="absolute inset-0 flex flex-col">
      {page.scrollBands.map((reach, i) => (
        <div
          key={i}
          className="relative flex-1 border-b border-white/10 last:border-0"
          style={{ background: heatColor(reach), opacity: 0.42 }}
        >
          <span className="absolute left-2 top-1 rounded bg-black/45 px-1.5 py-0.5 font-mono text-[0.62rem] font-medium text-white">
            {depths[i]} · {reach}% reach
          </span>
        </div>
      ))}
      {/* average fold */}
      <div
        className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-white"
        style={{ top: `${page.avgScroll}%` }}
      >
        <span className="absolute right-2 -top-5 rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.62rem] text-background">
          avg. fold — {page.avgScroll}%
        </span>
      </div>
    </div>
  );
}

export function HeatViewer({
  page,
  mode,
}: {
  page: HeatPage;
  mode: HeatMode;
}) {
  const DeviceIcon = page.device === "Mobile" ? Smartphone : Monitor;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          <Lock className="size-3" />
          sprout.app
          <span className="text-foreground">{page.path}</span>
        </div>
        <span className="flex items-center gap-1 font-mono text-[0.68rem] text-muted-foreground">
          <DeviceIcon className="size-3.5" />
          {page.device}
        </span>
      </div>

      {/* stage */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-background">
        <WireframePage device={page.device} />
        {mode === "scroll" ? (
          <ScrollOverlay page={page} />
        ) : (
          <HeatOverlay
            hotspots={page.hotspots}
            className={cn(mode === "attention" && "opacity-80")}
          />
        )}
        {/* hotspot labels for click mode */}
        {mode === "click" &&
          page.hotspots
            .filter((h) => h.weight > 0.6 && h.label)
            .map((h, i) => (
              <span
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground/90 px-1.5 py-0.5 font-mono text-[0.62rem] font-medium text-background shadow-sm"
                style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
              >
                {h.label}
              </span>
            ))}
      </div>

      {/* legend */}
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <span className="font-mono text-[0.68rem] uppercase tracking-wider text-muted-foreground">
          {mode === "scroll" ? "Scroll reach" : "Click density"}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.68rem] text-muted-foreground">Low</span>
          <div
            className="h-2 w-40 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, var(--heat-0), var(--heat-1), var(--heat-2), var(--heat-3), var(--heat-4))",
            }}
          />
          <span className="font-mono text-[0.68rem] text-muted-foreground">High</span>
        </div>
      </div>
    </div>
  );
}
