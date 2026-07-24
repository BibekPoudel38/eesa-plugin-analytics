import { cn } from "@/lib/utils";

const W = 1000;
const H = 300;
const PAD_Y = 18;

function scaleY(v: number, min: number, range: number) {
  return PAD_Y + (H - PAD_Y * 2) * (1 - (v - min) / range);
}

function smoothPath(values: number[], min: number, range: number) {
  const stepX = W / (values.length - 1);
  const pts = values.map((v, i) => ({ x: i * stepX, y: scaleY(v, min, range) }));

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
  }
  return { d, pts };
}

/**
 * Responsive filled area chart. Server-renderable pure SVG — no chart lib.
 * `data` is the lead series; `data2` an optional secondary line. An optional
 * `marker` renders a crisp HTML callout bubble (drawn as an overlay so it
 * isn't distorted by the SVG's non-uniform scaling).
 */
export function AreaChart({
  data,
  data2,
  color = "var(--teal)",
  color2 = "var(--ember)",
  className,
  ariaLabel,
  marker,
}: {
  data: number[];
  data2?: number[];
  color?: string;
  color2?: string;
  className?: string;
  ariaLabel?: string;
  marker?: { index: number; label: string };
}) {
  const all = data2 ? [...data, ...data2] : data;
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min || 1;

  const gid = `area-${data.length}-${Math.round(data[0] ?? 0)}`;
  const { d, pts } = smoothPath(data, min, range);
  const area = `${d} L ${W},${H} L 0,${H} Z`;
  const second = data2 ? smoothPath(data2, min, range) : null;

  const mi =
    marker && marker.index >= 0 && marker.index < data.length ? marker.index : null;
  const mx = mi !== null ? (mi / (data.length - 1)) * 100 : 0;
  const my = mi !== null ? (scaleY(data[mi], min, range) / H) * 100 : 0;

  return (
    <div className={cn("relative h-full w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="55%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={W}
            y1={PAD_Y + (H - PAD_Y * 2) * g}
            y2={PAD_Y + (H - PAD_Y * 2) * g}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="2 6"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gid})`} />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
        {second && (
          <path
            d={second.d}
            fill="none"
            stroke={color2}
            strokeWidth="2"
            strokeDasharray="1 5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
          />
        )}
        {/* last-point marker with a soft halo */}
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="9"
          fill={color}
          opacity="0.14"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="4"
          fill={color}
          stroke="var(--card)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* crisp HTML tooltip callout, as in the reference */}
      {mi !== null && (
        <div className="pointer-events-none absolute inset-0">
          <span
            className="absolute w-px -translate-x-1/2 bg-foreground/15"
            style={{ left: `${mx}%`, top: `${my}%`, bottom: 0 }}
          />
          <span
            className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-[var(--shadow-card)]"
            style={{ left: `${mx}%`, top: `${my}%`, background: color }}
          />
          <span
            className="tabular absolute -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 font-mono text-xs font-semibold text-background shadow-[var(--shadow-pop)]"
            style={{ left: `${mx}%`, top: `${my}%` }}
          >
            {marker!.label}
            <span className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground" />
          </span>
        </div>
      )}
    </div>
  );
}
