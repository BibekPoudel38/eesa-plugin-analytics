import { cn } from "@/lib/utils";

/**
 * Eesa signature — concentric "attention contours" rising to a hotspot core.
 * The whole product's visual metaphor (cartography of attention) in one mark.
 */
export function ContourMark({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* outer contour rings — irregular, like a topographic map of clicks */}
      <path
        d="M16 3.5c8.2 0 13 5.4 13 12.4 0 7.4-5.6 12.6-13 12.6S3 23.3 3 15.9C3 8.9 7.8 3.5 16 3.5Z"
        stroke="var(--teal)"
        strokeWidth="1.4"
        strokeOpacity="0.45"
      />
      <path
        d="M16 7.2c5.9 0 9.4 3.7 9.4 8.6 0 5.1-3.8 8.8-9.4 8.8s-9.4-3.7-9.4-8.8c0-4.9 3.5-8.6 9.4-8.6Z"
        stroke="var(--amber)"
        strokeWidth="1.5"
        strokeOpacity="0.65"
      />
      <path
        d="M16 11c3.4 0 5.6 2.1 5.6 4.9s-2.2 5-5.6 5-5.6-2.2-5.6-5S12.6 11 16 11Z"
        stroke="var(--ember)"
        strokeWidth="1.6"
        strokeOpacity="0.85"
      />
      {/* hotspot core */}
      <circle cx="16" cy="15.9" r="2.6" fill="var(--ember)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ContourMark size={26} />
      <span className="font-display text-[1.15rem] font-bold tracking-tight text-foreground">
        Eesa <span className="font-semibold text-muted-foreground">Analytics</span>
      </span>
    </span>
  );
}
