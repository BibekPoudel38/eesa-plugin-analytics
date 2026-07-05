import { Sparkline } from "@/components/charts/sparkline";
import { DeltaPill, Eyebrow } from "@/components/app/primitives";
import { compactNumber, duration, percent } from "@/lib/format";
import type { Kpi } from "@/lib/mock/data";

function formatValue(k: Kpi): string {
  if (k.format === "duration") return duration(k.value);
  if (k.format === "percent") return percent(k.value);
  return compactNumber(k.value);
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  // "hot" metrics (friction) read in ember; healthy volume metrics in teal.
  const hot = kpi.key === "rage" || kpi.key === "bounce";
  const color = hot ? "var(--ember)" : "var(--teal)";

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-[0_1px_0_var(--border),0_8px_24px_-16px_rgba(20,25,20,0.28)]">
      <div className="flex items-start justify-between gap-2">
        <Eyebrow>{kpi.label}</Eyebrow>
        <DeltaPill delta={kpi.delta} goodUp={kpi.goodUp} />
      </div>
      <div className="tabular mt-2 font-display text-[1.7rem] font-bold leading-none tracking-tight text-foreground">
        {formatValue(kpi)}
      </div>
      <div className="mt-3">
        <Sparkline data={kpi.spark} color={color} />
      </div>
    </div>
  );
}
