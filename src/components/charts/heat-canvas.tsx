import { cn } from "@/lib/utils";
import type { Hotspot } from "@/lib/mock/data";

const VB_W = 100;
const VB_H = 63;

/**
 * The Chups heat overlay. Each hotspot is a radial "attention contour" whose
 * radius tracks its click weight; a soft blur melts overlaps together so pools
 * of attention read as terrain. Cold → hot follows the brand heat scale.
 */
export function HeatOverlay({
  hotspots,
  className,
}: {
  hotspots: Hotspot[];
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      className={cn("absolute inset-0 h-full w-full", className)}
      aria-hidden="true"
    >
      <defs>
        {hotspots.map((h, i) => (
          <radialGradient key={i} id={`heat-${i}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--heat-4)" stopOpacity={0.85 * h.weight} />
            <stop offset="28%" stopColor="var(--heat-3)" stopOpacity={0.6 * h.weight} />
            <stop offset="55%" stopColor="var(--heat-2)" stopOpacity={0.38 * h.weight} />
            <stop offset="78%" stopColor="var(--heat-1)" stopOpacity={0.2 * h.weight} />
            <stop offset="100%" stopColor="var(--heat-0)" stopOpacity="0" />
          </radialGradient>
        ))}
        <filter id="heat-melt">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      <g filter="url(#heat-melt)">
        {hotspots.map((h, i) => (
          <ellipse
            key={i}
            cx={h.x * VB_W}
            cy={h.y * VB_H}
            rx={7 + h.weight * 12}
            ry={7 + h.weight * 12}
            fill={`url(#heat-${i})`}
          />
        ))}
      </g>
    </svg>
  );
}

/** A neutral browser wireframe the heat sits on top of. */
export function WireframePage({ device }: { device: "Desktop" | "Mobile" }) {
  const bar = "rounded-full bg-muted";
  const block = "rounded-lg bg-muted/70";
  if (device === "Mobile") {
    return (
      <div className="mx-auto flex h-full w-[42%] flex-col gap-3 p-5">
        <div className={cn(bar, "h-4 w-1/2")} />
        <div className={cn(block, "h-16 w-full")} />
        <div className={cn(bar, "h-3 w-3/4")} />
        <div className={cn(bar, "h-3 w-2/3")} />
        <div className={cn(block, "mt-2 h-10 w-full")} />
        <div className={cn(block, "h-10 w-full")} />
        <div className={cn("mt-auto h-9 w-full rounded-lg bg-muted")} />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* nav */}
      <div className="flex items-center justify-between">
        <div className={cn(bar, "h-3.5 w-24")} />
        <div className="flex gap-3">
          <div className={cn(bar, "h-3 w-12")} />
          <div className={cn(bar, "h-3 w-12")} />
          <div className={cn(bar, "h-3 w-16")} />
        </div>
      </div>
      {/* hero */}
      <div className="mt-4 flex flex-col items-center gap-3">
        <div className={cn(bar, "h-6 w-2/3")} />
        <div className={cn(bar, "h-3 w-1/2")} />
        <div className="mt-2 h-8 w-36 rounded-lg bg-muted" />
      </div>
      {/* feature row */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className={cn(block, "h-24")} />
        <div className={cn(block, "h-24")} />
        <div className={cn(block, "h-24")} />
      </div>
      <div className={cn(block, "mt-2 h-16 w-full")} />
    </div>
  );
}
