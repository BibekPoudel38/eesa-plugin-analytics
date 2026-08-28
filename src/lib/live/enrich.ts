/**
 * Server-side ingest enrichment helpers (no DB, no server-only — pure).
 */

/** Split a "City, CC" geo label into parts. Either may be empty. */
export function splitLocation(label: string | undefined): {
  city: string;
  country: string;
} {
  const s = (label ?? "").trim();
  if (!s || s === "—") return { city: "", country: "" };
  const idx = s.lastIndexOf(", ");
  if (idx === -1) {
    // A bare 2-letter token is a country code; otherwise treat as city.
    return /^[A-Za-z]{2}$/.test(s)
      ? { city: "", country: s.toUpperCase() }
      : { city: s, country: "" };
  }
  return { city: s.slice(0, idx), country: s.slice(idx + 2) };
}

/**
 * Derive a coarse acquisition channel from the referrer, relative to the
 * tracked site's own origin. P1 keeps it simple: direct / internal / search /
 * social / referral. UTM parsing can refine this later from event props.
 */
export function deriveSource(referrer: string, siteOrigin: string): string {
  const ref = (referrer ?? "").trim();
  if (!ref) return "direct";
  let host = "";
  try {
    host = new URL(ref).host.toLowerCase();
  } catch {
    return "referral";
  }
  let selfHost = "";
  try {
    selfHost = siteOrigin ? new URL(siteOrigin).host.toLowerCase() : "";
  } catch {
    /* ignore */
  }
  if (selfHost && host === selfHost) return "internal";
  if (/(google|bing|duckduckgo|yahoo|yandex|baidu)\./.test(host)) return "search";
  if (
    /(facebook|instagram|twitter|x\.com|t\.co|linkedin|reddit|youtube|tiktok|pinterest)\./.test(
      host,
    )
  )
    return "social";
  return "referral";
}

/**
 * Normalise the display mode a browser reported.
 *
 * The set of display modes is closed, so this is an allowlist rather than a
 * scrub: anything unrecognised becomes "", which reads as "the browser did not
 * say". That matters because this value reaches dashboards and group-by
 * queries, and an arbitrary string from a page we do not control would land
 * there as its own category.
 */
const DISPLAY_MODES = new Set([
  "browser",
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
]);

export function cleanDisplayMode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim().toLowerCase();
  return DISPLAY_MODES.has(v) ? v : "";
}
