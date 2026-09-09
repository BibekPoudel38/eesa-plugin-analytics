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
  display_mode: string;
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
            e.x, e.y, e.target, e.text, e.depth, e.name, e.props,
            -- Which surface sent it. Selected so every existing aggregation
            -- can be run over one surface instead of the merged pile; without
            -- it the app's 19,000 events could be counted but never analysed.
            e.display_mode
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
      displayMode: r.display_mode || undefined,
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


/** One surface's activity on one site: what arrived, and when it last did.
 *
 *  `display_mode` has been written on every event since the tracker learned to
 *  send it, and read by nothing — so 20,000 app events sat in the same pile as
 *  the website's and no screen could tell them apart. This is the read side of
 *  the split that was promised when the app client shipped.
 *
 *  Two windows, not one. A surface that has gone silent is the failure this is
 *  built to catch, and silence is only visible against what came before: zero
 *  events reads as health when you cannot see that yesterday it was twelve
 *  thousand.
 */
export interface SurfaceRow {
  siteId: string;
  /** app | web | installed | unknown — the surface, not the raw display_mode.
   *  Grouped in SQL rather than in JS: `standalone` and `fullscreen` are both
   *  an installed web app, and folding them afterwards would double-count a
   *  visitor who used both, since distinct counts do not add. */
  kind: string;
  events: number;
  visitors: number;
  identified: number;    // events carrying a user id — identify() working
  lastSeen: string | null;
  priorEvents: number;   // the window before this one
}

export async function loadSurfaces(
  tenantId: string,
  sinceMs: number,
): Promise<SurfaceRow[]> {
  const since = new Date(sinceMs);
  const prior = new Date(sinceMs - (Date.now() - sinceMs));
  // display_mode is a CSS media feature plus the one value the app invents.
  // Collapsed to a surface here so the grouping — and therefore the distinct
  // visitor count — is done once, by the database.
  const KIND = `case
      when display_mode = 'app' then 'app'
      when display_mode = 'browser' then 'web'
      when display_mode in ('standalone', 'fullscreen', 'minimal-ui') then 'installed'
      else 'unknown'
    end`;
  const rows = await query<{
    site_id: string; kind: string; events: string; visitors: string;
    identified: string; last_seen: Date | null; prior_events: string;
  }>(
    `with cur as (
       select site_id,
              ${KIND}                                   as kind,
              count(*)                                  as events,
              count(distinct visitor_id)                as visitors,
              count(*) filter (where user_id <> '')     as identified,
              max(ts)                                   as last_seen
         from events
        where tenant_id = $1 and ts >= $2
        group by 1, 2
     ), prev as (
       select site_id,
              ${KIND} as kind,
              count(*) as prior_events
         from events
        where tenant_id = $1 and ts >= $3 and ts < $2
        group by 1, 2
     )
     -- FULL OUTER: a surface present in only one window is exactly the
     -- interesting case. An inner join would hide the one that stopped.
     select coalesce(c.site_id, p.site_id)                as site_id,
            coalesce(c.kind, p.kind)                      as kind,
            coalesce(c.events, 0)                         as events,
            coalesce(c.visitors, 0)                       as visitors,
            coalesce(c.identified, 0)                     as identified,
            c.last_seen                                   as last_seen,
            coalesce(p.prior_events, 0)                   as prior_events
       from cur c
       full outer join prev p on p.site_id = c.site_id and p.kind = c.kind`,
    [tenantId, since, prior],
  );
  // bigints arrive as strings — see loadCounts.
  return rows.map((r) => ({
    siteId: String(r.site_id),
    kind: r.kind,
    events: Number(r.events ?? 0),
    visitors: Number(r.visitors ?? 0),
    identified: Number(r.identified ?? 0),
    lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null,
    priorEvents: Number(r.prior_events ?? 0),
  }));
}
