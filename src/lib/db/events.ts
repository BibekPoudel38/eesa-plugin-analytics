import "server-only";
import { query } from "./pool";

/**
 * Events data layer — the WRITE side (ingest). Reads/aggregations for the
 * dashboard are added in P2 (they hit the `events_hourly` continuous aggregate).
 *
 * Rows are always written with the (tenant_id, site_id) resolved from the
 * public site tracking key — never from client input.
 */

export interface EventInsert {
  ts: Date; // server receive time (authoritative)
  clientTs: Date | null; // browser-reported time
  type: string;
  path: string;
  visitorId: string;
  sessionId: string;
  /** Site's own user id if the visitor was identified when this fired; "" otherwise. */
  userId: string;
  referrer: string;
  source: string;
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

const NCOLS = 23; // must match the column list below

/**
 * Bulk-insert a batch of events for one tenant/site. Builds a single
 * multi-row parameterized INSERT (batches are capped at 500 upstream, well
 * under Postgres's parameter limit).
 */
export async function insertEvents(
  tenantId: string,
  siteId: string,
  rows: EventInsert[],
): Promise<number> {
  if (!rows.length) return 0;

  const params: unknown[] = [];
  const tuples: string[] = [];
  for (const e of rows) {
    const base = params.length;
    tuples.push(
      "(" +
        Array.from({ length: NCOLS }, (_, k) => `$${base + k + 1}`).join(", ") +
        ")",
    );
    params.push(
      tenantId,
      siteId,
      e.ts,
      e.clientTs,
      e.type,
      e.path,
      e.visitorId,
      e.sessionId,
      e.userId,
      e.referrer,
      e.source,
      e.device,
      e.browser,
      e.os,
      e.country,
      e.city,
      e.x,
      e.y,
      e.target,
      e.text,
      e.depth,
      e.name,
      e.props == null ? null : JSON.stringify(e.props),
    );
  }

  await query(
    `insert into events
       (tenant_id, site_id, ts, client_ts, type, path, visitor_id, session_id,
        user_id, referrer, source, device, browser, os, country, city, x, y,
        target, text, depth, name, props)
     values ${tuples.join(", ")}`,
    params,
  );
  return rows.length;
}
