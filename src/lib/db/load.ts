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
