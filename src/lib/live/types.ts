/** Shared event contract between eesa-analytics.js (browser) and the ingest API. */

export type EventType =
  | "pageview"
  | "click"
  | "rageclick"
  | "deadclick"
  | "scroll"
  | "custom"
  | "session_end";

export type RawEvent = {
  type: EventType;
  /** page path, e.g. "/events.html" */
  path: string;
  /** ms epoch, set by the browser */
  ts: number;
  /** click x normalized to viewport width (0..1) */
  x?: number;
  /** click y normalized to *document* height (0..1) */
  y?: number;
  /** best-effort CSS-ish label for the clicked element */
  target?: string;
  /** visible text of the clicked element (trimmed) */
  text?: string;
  /** max scroll depth reached, 0..100 */
  depth?: number;
  /** custom event name */
  name?: string;
  /** custom event properties */
  props?: Record<string, string | number | boolean>;
  /** document title */
  title?: string;
};

export type Meta = {
  siteId: string;
  visitorId: string;
  sessionId: string;
  /**
   * The tracked site's OWN user identifier, set by its identify() call and
   * opaque to us — a customer id, an account id, whatever that site has.
   * Absent or "" while the visitor is anonymous, which is the normal state.
   */
  userId?: string;
  referrer: string;
  device: "Desktop" | "Mobile" | "Tablet";
  browser: string;
  os: string;
  viewportW: number;
  viewportH: number;
  /**
   * How the page is displayed: "standalone" when it was launched from the home
   * screen (an installed PWA), "browser" in a normal tab, or "" when the
   * browser would not say. Distinguishes app-like usage from browser usage.
   */
  displayMode?: string;
  /** "City, CC" — enriched server-side from request geo headers (never from the browser). */
  location?: string;
  /** Origin of the tracked site, read server-side from the collect request's Origin/Referer. */
  origin?: string;
};

/** What the browser POSTs to /api/collect. */
export type Batch = {
  meta: Meta;
  events: RawEvent[];
};

/** A raw event after server enrichment — this is what the store holds. */
export type StoredEvent = RawEvent & {
  siteId: string;
  visitorId: string;
  sessionId: string;
  /**
   * Resolved identity: the id stamped at ingest, or — for events captured
   * before this visitor signed in — the one their `identities` row supplies.
   * "" while the visitor has never been identified on any visit.
   */
  userId: string;
  referrer: string;
  device: Meta["device"];
  browser: string;
  os: string;
  /** "City, CC" — geo-enriched at ingest; "—" when unknown */
  location: string;
  /** tracked-site origin (e.g. https://www.example.com); "" when unknown */
  origin: string;
  /** server receive time (authoritative for ordering) */
  recvTs: number;
};
