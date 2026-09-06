import "server-only";
import { query } from "./pool";
import type { StoredEvent } from "@/lib/live/types";

/**
 * Load tenant+site-scoped events from Timescale as {@link StoredEvent}[] — the
 * exact shape the existing pure aggregators in `src/lib/live/aggregate.ts`
 * already consume. This is the bridge that lets every screen go live without
 * rewriting any aggregation logic: swap the store, keep the maths.
 *
 * Bounded by `limit` (and the 90-day raw-event retention) so a dashboard render
 * can't pull an unbounded set into memory. For heavier windows the hourly
 * continuous aggregate (`events_hourly`) is the future fast path.
 */

interface EventRow {
  ts: Date;
  client_ts: Date | null;
  type: string;
  path: string;
  visitor_id: string;
  session_id: string;
  user_id: string;
  referrer: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  x: number | null;
  y: number | null;
  target: string | null;
  text: string | null;
  depth: number | null;
  name: string | null;
  props: Record<string, unknown> | null;
}

function locationLabel(city: string, country: string): string {
  if (city && country) return `${city}, ${country}`;
  return city || country || "—";
}

export async function loadEvents(
  tenantId: string,
  siteId: string,
  sinceMs: number,
  limit = 200_000,
): Promise<StoredEvent[]> {
  // Identity is resolved HERE, not stored back onto the row. `e.user_id` is set
  // only on events captured after the visitor signed in; the join supplies the
  // same person for everything they did before that, which is what makes
  // identification retroactive without ever rewriting history. A visitor who
  // has never identified on any visit falls through to "".
  const rows = await query<EventRow>(
    `select e.ts, e.client_ts, e.type, e.path, e.visitor_id, e.session_id,
            coalesce(nullif(e.user_id, ''), i.user_id, '') as user_id,
            e.referrer, e.device, e.browser, e.os, e.country, e.city,
            e.x, e.y, e.target, e.text, e.depth, e.name, e.props
       from events e
       left join identities i
              on i.tenant_id  = e.tenant_id
             and i.site_id    = e.site_id
             and i.visitor_id = e.visitor_id
      where e.tenant_id = $1 and e.site_id = $2 and e.ts >= $3
      order by e.ts asc
      limit $4`,
    [tenantId, siteId, new Date(sinceMs), limit],
  );

  return rows.map((r): StoredEvent => {
    const recvTs = r.ts.getTime();
    const clientTs = r.client_ts ? r.client_ts.getTime() : recvTs;
    return {
      type: r.type as StoredEvent["type"],
      path: r.path,
      ts: clientTs,
      x: r.x ?? undefined,
      y: r.y ?? undefined,
      target: r.target ?? undefined,
      text: r.text ?? undefined,
      depth: r.depth ?? undefined,
      name: r.name ?? undefined,
      props: (r.props as StoredEvent["props"]) ?? undefined,
      siteId,
      visitorId: r.visitor_id,
      sessionId: r.session_id,
      userId: r.user_id ?? "",
      referrer: r.referrer,
      device: (r.device || "Desktop") as StoredEvent["device"],
      browser: r.browser,
      os: r.os,
      location: locationLabel(r.city, r.country),
      origin: "",
      recvTs,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregates that must NOT read rows
// ---------------------------------------------------------------------------
//
// `loadEvents` exists so the pure aggregators in `live/aggregate.ts` can keep
// doing the maths in JS. That is a fair trade when the maths is genuinely
// per-event. It is a terrible one for a headline count: the status strip needs
// three integers and eight rows, and it was getting them by pulling every event
// for the window — measured on production at 135,102 rows, ~50 MB and ~1.2 s,
// on a page that also loads the same events twice more for its other panels.
//
// Postgres answers the same three integers in ~130 ms without sending a single
// event over the wire. The rule this encodes: if a screen needs a NUMBER, ask
// the database for the number.

export interface LiveCounts {
  events: number;
  visitors: number;
  sessions: number;
}

/** Headline counts for a window, computed in the database. */
export async function loadCounts(
  tenantId: string,
  siteId: string,
  sinceMs: number,
): Promise<LiveCounts> {
  const rows = await query<{ events: string; visitors: string; sessions: string }>(
    `select count(*)                    as events,
            count(distinct visitor_id)  as visitors,
            count(distinct session_id)  as sessions
       from events
      where tenant_id = $1 and site_id = $2 and ts >= $3`,
    [tenantId, siteId, new Date(sinceMs)],
  );
  const r = rows[0];
  // count() comes back as a bigint, which node-postgres hands over as a STRING
  // to avoid a silent precision loss past 2^53. Number() here is safe (an event
  // count cannot reach that) but the parse must be explicit — left as-is these
  // land in the UI as "135102" concatenated rather than summed.
  return {
    events: Number(r?.events ?? 0),
    visitors: Number(r?.visitors ?? 0),
    sessions: Number(r?.sessions ?? 0),
  };
}

export interface RecentEvent {
  type: string;
  path: string;
  label: string;
  ts: number;
}

/**
 * The newest events in a window, newest first.
 *
 * Ordered by `ts` — the server receive time — because that is what the previous
 * implementation ordered by, and it is the only clock this service controls; a
 * device with a wrong system time cannot reorder the strip.
 */
export async function loadRecentEvents(
  tenantId: string,
  siteId: string,
  sinceMs: number,
  limit = 8,
): Promise<RecentEvent[]> {
  const rows = await query<{ ts: Date; type: string; path: string; name: string | null }>(
    `select ts, type, path, name
       from events
      where tenant_id = $1 and site_id = $2 and ts >= $3
      order by ts desc
      limit $4`,
    [tenantId, siteId, new Date(sinceMs), limit],
  );
  return rows.map((r) => ({
    type: r.type,
    path: r.path,
    // `title` is on RawEvent but has no column and is never selected, so the
    // old expression `e.title ?? e.path` always resolved to the path. Kept
    // literal rather than "improved", so this returns what the strip showed.
    label: r.type === "custom" ? (r.name ?? "custom") : r.path,
    ts: r.ts.getTime(),
  }));
}
