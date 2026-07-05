/** Shared event contract between chups.js (browser) and the ingest API. */

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
  referrer: string;
  device: "Desktop" | "Mobile" | "Tablet";
  browser: string;
  os: string;
  viewportW: number;
  viewportH: number;
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
  referrer: string;
  device: Meta["device"];
  browser: string;
  os: string;
  /** server receive time (authoritative for ordering) */
  recvTs: number;
};
