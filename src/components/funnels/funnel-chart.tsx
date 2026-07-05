import { fullNumber, percent } from "@/lib/format";
import type { FunnelStep } from "@/lib/mock/data";

/** Vertical funnel. Each step's bar is a share of the top step; the gap
 * between steps is called out as drop-off in ember. */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0].users;

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const pctOfTop = (step.users / top) * 100;
        const prev = i === 0 ? step.users : steps[i - 1].users;
        const stepConv = (step.users / prev) * 100;
        const drop = prev - step.users;
        const isLast = i === steps.length - 1;

        return (
          <div key={step.label}>
            <div className="flex items-center gap-4 py-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">
                    {step.label}
                  </span>
                  <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                    {fullNumber(step.users)} · {percent(pctOfTop, 0)}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${pctOfTop}%`,
                      background: isLast
                        ? "var(--ember)"
                        : "var(--teal)",
                    }}
                  />
                </div>
              </div>
            </div>

            {!isLast && (
              <div className="ml-[2.5rem] flex items-center gap-2 py-0.5 pl-4">
                <span className="h-3 w-px bg-border" />
                <span className="font-mono text-[0.68rem] text-muted-foreground">
                  <span className="text-foreground">{percent(stepConv, 0)}</span>{" "}
                  continue
                </span>
                <span className="font-mono text-[0.68rem] text-ember">
                  −{fullNumber(drop)} dropped
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
