import { cn } from "@/lib/utils";
import { signedPercent } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/** Small uppercase label that names a section without shouting. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[0.68rem] font-medium uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Change pill. Colour is keyed to *sentiment*, not direction — a falling bounce
 * rate is good and shows green, a rising rage-click count is bad and shows red.
 */
export function DeltaPill({
  delta,
  goodUp = true,
  className,
}: {
  delta: number;
  goodUp?: boolean;
  className?: string;
}) {
  const up = delta > 0;
  const good = up === goodUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-xs font-medium",
        good
          ? "bg-[var(--pine)]/12 text-[var(--pine)]"
          : "bg-destructive/12 text-destructive",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {signedPercent(delta)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
          {title}
        </h1>
        {description && (
          <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
