"use client";

import { useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RANGES, normalizeRange } from "@/lib/ranges";
import { cn } from "@/lib/utils";

/** Reads the active range from the URL and writes it back, preserving any other
 *  query params (e.g. the visitors `f` filter or heatmap `p`/`mode`). */
function useRangeNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const current = normalizeRange(params.get("range"));
  const go = useCallback(
    (key: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("range", key);
      startTransition(() =>
        router.push(`${pathname}?${next.toString()}`, { scroll: false }),
      );
    },
    [router, pathname, params],
  );
  return { current, go, pending };
}

/** Topbar dropdown: Today / Last 7 days / Last 30 days / Last 90 days. */
export function RangeSelect() {
  const { current, go } = useRangeNav();
  return (
    <Select value={current} onValueChange={(v) => v && go(v)}>
      <SelectTrigger className="gap-1.5 bg-card">
        <Calendar className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {RANGES.map((r) => (
          <SelectItem key={r.key} value={r.key}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Compact segmented control on the Traffic chart (Day / Week / Month). */
export function RangeTabs() {
  const { current, go } = useRangeNav();
  const tabs = RANGES.filter((r) => r.tab);
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5">
      {tabs.map((r) => {
        const on = current === r.key;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => go(r.key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
              on
                ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.tab}
          </button>
        );
      })}
    </div>
  );
}
