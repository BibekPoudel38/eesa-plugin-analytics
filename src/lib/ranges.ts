/** Time-range filter shared by the topbar selector, the traffic tabs, and the
 *  server data layer. Plain module (no server-only / use-client) so both sides
 *  can import it. */

export type RangeKey = "today" | "7d" | "30d" | "90d";

export const DEFAULT_RANGE: RangeKey = "30d";

export const RANGES: {
  key: RangeKey;
  label: string; // topbar select
  tab: string | null; // traffic segmented (null = not offered as a tab)
  days: number;
}[] = [
  { key: "today", label: "Today", tab: "Day", days: 1 },
  { key: "7d", label: "Last 7 days", tab: "Week", days: 7 },
  { key: "30d", label: "Last 30 days", tab: "Month", days: 30 },
  { key: "90d", label: "Last 90 days", tab: null, days: 90 },
];

export function normalizeRange(v: string | undefined | null): RangeKey {
  return RANGES.find((r) => r.key === v)?.key ?? DEFAULT_RANGE;
}

export function rangeDays(v: string | undefined | null): number {
  return RANGES.find((r) => r.key === normalizeRange(v))!.days;
}

export function rangeLabel(v: string | undefined | null): string {
  return RANGES.find((r) => r.key === normalizeRange(v))!.label;
}

/** Five evenly-spaced x-axis labels for the trend chart, per range. */
export function axisLabels(v: string | undefined | null): string[] {
  switch (normalizeRange(v)) {
    case "today":
      return ["24h ago", "18h", "12h", "6h", "Now"];
    case "7d":
      return ["7 days ago", "5d", "3d", "1d", "Today"];
    case "90d":
      return ["90 days ago", "60d", "30d", "15d", "Today"];
    case "30d":
    default:
      return ["30 days ago", "3 wks", "2 wks", "1 wk", "Today"];
  }
}
