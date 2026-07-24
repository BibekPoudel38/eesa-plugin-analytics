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
  const rows = await query<EventRow>(
    `select ts, client_ts, type, path, visitor_id, session_id, referrer,
            device, browser, os, country, city, x, y, target, text, depth,
            name, props
       from events
      where tenant_id = $1 and site_id = $2 and ts >= $3
      order by ts asc
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
