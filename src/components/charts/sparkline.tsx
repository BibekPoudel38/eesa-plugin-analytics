import { cn } from "@/lib/utils";

/** Tiny inline trend line — pure SVG, scales to its container. */
export function Sparkline({
  data,
  color = "var(--teal)",
  filled = true,
  className,
}: {
  data: number[];
  color?: string;
  filled?: boolean;
  className?: string;
}) {
  const w = 120;
  const h = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - 3 - (h - 6) * ((v - min) / range)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const gid = `spark-${color.replace(/\W/g, "")}-${Math.round(data[0] ?? 0)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-8 w-full", className)}
      aria-hidden="true"
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L ${w},${h} L 0,${h} Z`} fill={`url(#${gid})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
