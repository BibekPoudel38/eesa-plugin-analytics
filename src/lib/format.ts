/** Formatting helpers — kept pure so screens stay declarative. */

export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (Math.abs(n) >= 1_000)
    return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "k";
  return String(n);
}

export function fullNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function percent(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function signedPercent(n: number, digits = 1): string {
  const s = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${s}${Math.abs(n).toFixed(digits)}%`;
}

/** Seconds → "3m 24s" / "48s". */
export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/** Minutes-ago → relative label, deterministic (no Date.now at module scope). */
export function relativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return "just now";
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}m ago`;
  const hours = minutesAgo / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  return `${Math.round(days)}d ago`;
}
