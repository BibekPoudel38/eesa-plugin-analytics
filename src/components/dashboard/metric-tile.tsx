import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact clickable stat tile for count-style metrics (orders, cart, meal pass).
 * Links through to a filtered visitors view so the number is explorable.
 */
export function MetricTile({
  label,
  value,
  sub,
  href,
  icon: Icon,
  color = "var(--teal)",
}: {
  label: string;
  value: number;
  sub?: string;
  href: string;
  icon: LucideIcon;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-ember/40 hover:shadow-[var(--shadow-card-hover)]"
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="tabular font-display text-2xl font-bold leading-none tracking-tight text-foreground">
            {value}
          </span>
          <ArrowUpRight className="size-4 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-ember group-hover:opacity-100" />
        </div>
        <p className="mt-1.5 truncate text-sm font-medium text-foreground">{label}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Link>
  );
}
