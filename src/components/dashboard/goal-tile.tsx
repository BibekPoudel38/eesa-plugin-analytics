import Link from "next/link";
import * as Icons from "lucide-react";
import { Target, Plus, type LucideIcon } from "lucide-react";
import type { GoalCard } from "@/lib/goals/compute";

/**
 * A tenant-defined conversion card.
 *
 * Shape mirrors MetricTile so a goal card and a built-in stat read as the same
 * kind of object. The difference is the second line: a goal always shows the
 * conversion RATE and the rule it counted, because a bare number nobody can
 * trace ("412") is what makes people stop trusting a dashboard.
 */

const PALETTE = ["var(--pine)", "var(--teal)", "var(--ember)", "var(--amber)", "var(--iris)"];

/** Any lucide icon by name, falling back to a target rather than crashing on a
 *  name the tenant typed by hand. */
function iconFor(name: string): LucideIcon {
  if (!name) return Target;
  const key = name.trim();
  const found = (Icons as unknown as Record<string, LucideIcon>)[key];
  return typeof found === "function" ? found : Target;
}

function pct(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  const v = rate * 100;
  return v < 1 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
}

/** Human form of the rule, so the card explains itself. */
export function ruleText(c: Pick<GoalCard, "kind" | "operator" | "value">) {
  if (c.kind === "event") return `event “${c.value}”`;
  if (c.operator === "exact") return `path is ${c.value}`;
  if (c.operator === "starts_with") return `path starts with ${c.value}`;
  return `path contains ${c.value}`;
}

export function GoalTile({ card, index }: { card: GoalCard; index: number }) {
  const Icon = iconFor(card.icon);
  const color = PALETTE[index % PALETTE.length];
  return (
    <Link
      href={`/app/sessions?goal=${encodeURIComponent(card.id)}`}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-ember/40 hover:shadow-[var(--shadow-card-hover)]"
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="tabular font-display text-2xl font-bold leading-none tracking-tight text-foreground">
            {card.sessions}
          </span>
          <span className="tabular text-sm font-semibold" style={{ color }}>
            {pct(card.rate)}
          </span>
        </div>
        <p className="mt-1.5 truncate text-sm font-medium text-foreground">{card.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {card.totalSessions
            ? `${card.sessions} of ${card.totalSessions} sessions · ${ruleText(card)}`
            : ruleText(card)}
        </p>
      </div>
    </Link>
  );
}

/**
 * Shown when the tenant has not defined any goals. Deliberately an invitation
 * rather than an empty grid — this replaced two cards that used to be there
 * unconditionally, so silence here would read as a regression.
 */
export function NoGoals() {
  return (
    <Link
      href="/app/goals"
      className="group flex items-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 p-4 transition-colors hover:border-ember/40"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:text-ember">
        <Plus className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Add a conversion card</p>
        <p className="text-xs text-muted-foreground">
          Track anything this site cares about — a checkout page, a confirmation
          page, or a single product.
        </p>
      </div>
    </Link>
  );
}
