import { cn } from "@/lib/utils";

export type DonutSlice = { name: string; value: number; color: string };

/** Ring chart. Total is the sum of slice values unless it already sums to 100. */
export function Donut({
  slices,
  size = 132,
  thickness = 16,
  centerTop,
  centerBottom,
  className,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
  className?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 3 : 0; // px gap between segments
  let offset = 0;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {slices.map((s) => {
          const frac = s.value / total;
          const dash = Math.max(frac * c - gap, 0.5);
          const seg = (
            <circle
              key={s.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += frac * c;
          return seg;
        })}
      </svg>
      {(centerTop || centerBottom) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerTop && (
            <span className="tabular font-display text-xl font-bold leading-none text-foreground">
              {centerTop}
            </span>
          )}
          {centerBottom && (
            <span className="mt-1 text-xs text-muted-foreground">{centerBottom}</span>
          )}
        </div>
      )}
    </div>
  );
}
