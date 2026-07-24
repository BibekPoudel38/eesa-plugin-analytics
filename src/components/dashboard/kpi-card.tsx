import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { DeltaPill, Eyebrow } from "@/components/app/primitives";
import { compactNumber, duration, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/mock/data";

function formatValue(k: Kpi): string {
  if (k.format === "duration") return duration(k.value);
  if (k.format === "percent") return percent(k.value);
  return compactNumber(k.value);
}

export function KpiCard({ kpi, href }: { kpi: Kpi; href?: string }) {
  // "hot" metrics (friction) read in ember; healthy volume metrics in teal.
  const hot = kpi.key === "rage" || kpi.key === "bounce";
  const color = hot ? "var(--ember)" : "var(--teal)";

  const base =
    "group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-[var(--shadow-card-hover)]";

  const body = (
    <>
      {/* accent hairline that warms on hover, tinted to the metric's family */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{kpi.label}</Eyebrow>
        <DeltaPill delta={kpi.delta} goodUp={kpi.goodUp} />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="tabular font-display text-[1.75rem] font-bold leading-none tracking-tight text-foreground">
          {formatValue(kpi)}
        </span>
        {href && (
          <ArrowUpRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-ember group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-3.5 -mb-0.5">
        <Sparkline data={kpi.spark} color={color} />
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(base, "cursor-pointer hover:border-ember/40")}>
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}
