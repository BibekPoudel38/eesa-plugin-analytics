import { cn } from "@/lib/utils";
import { compactNumber } from "@/lib/format";

export type BarItem = {
  label: string;
  value: number;
  color?: string;
  sub?: string;
};

/**
 * Ranked horizontal bars — the bar sits *behind* the label (Plausible-style),
 * so the row reads as one object: name, magnitude, count.
 */
export function BarList({
  items,
  className,
  valueFormatter = compactNumber,
}: {
  items: BarItem[];
  className?: string;
  valueFormatter?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {items.map((item) => (
        <li key={item.label} className="group relative overflow-hidden rounded-lg">
          <div
            className="absolute inset-y-0 left-0 rounded-lg transition-[width,opacity] duration-500 group-hover:opacity-100"
            style={{
              width: `${(item.value / max) * 100}%`,
              background: item.color ?? "var(--ember-soft)",
              opacity: item.color ? 0.16 : 1,
            }}
          />
          <div className="relative flex items-center justify-between px-2.5 py-1.5 transition-colors group-hover:bg-foreground/[0.02]">
            <span className="flex items-center gap-2 truncate text-sm text-foreground">
              {item.color && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
              )}
              <span className="truncate">{item.label}</span>
              {item.sub && (
                <span className="font-mono text-xs text-muted-foreground">
                  {item.sub}
                </span>
              )}
            </span>
            <span className="tabular ml-3 shrink-0 font-mono text-sm text-muted-foreground">
              {valueFormatter(item.value)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
