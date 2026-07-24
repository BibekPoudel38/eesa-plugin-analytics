"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pill segmented control — a white active pill riding on a muted track, the
 * Swiftpay-style Day/Week/Month switch. Visual-only for the demo data.
 */
export function Segmented({
  options,
  defaultValue,
  size = "sm",
  className,
  onChange,
}: {
  options: string[];
  defaultValue?: string;
  size?: "sm" | "md";
  className?: string;
  onChange?: (value: string) => void;
}) {
  const [active, setActive] = useState(defaultValue ?? options[0]);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const on = o === active;
        return (
          <button
            key={o}
            type="button"
            onClick={() => {
              setActive(o);
              onChange?.(o);
            }}
            className={cn(
              "rounded-full font-semibold transition-all duration-200",
              size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
              on
                ? "bg-card text-foreground shadow-[var(--shadow-card)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** The little "…" affordance in the corner of a card, as in the reference. */
export function KebabButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="More options"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-muted-foreground shadow-[var(--shadow-card)] transition-colors hover:text-foreground",
        className,
      )}
    >
      <MoreHorizontal className="size-4" />
    </button>
  );
}
