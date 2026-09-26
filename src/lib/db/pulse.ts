import "server-only";
import { query } from "./pool";
import type { PulseRow } from "@/lib/live/pulse";

/**
 * The facts behind a site's pulse (src/lib/live/pulse.ts), in one query.
 *
 * Reads 14 days of one site's events in timestamp order — the
 * (tenant_id, site_id, ts) index serves it — and never pulls them into this
 * process: the gaps, the per-day longest spells and their median are worked
 * out in the database. The quiet spell still going on has no event closing it
 * yet, so it is never counted as part of "usual".
 */
export async function loadPulse(
  tenantId: string,
  siteId: string,
  timezone: string,
): Promise<PulseRow> {
  const rows = await query<PulseRow>(
    `with ev as (
       select ts, lag(ts) over (order by ts) as prev
         from events
        where tenant_id = $1 and site_id = $2 and ts > now() - interval '14 days'
     ),
     latest as (
       select max(ts) as ts,
              count(*) filter (where ts > now() - interval '1 hour') as last_hour
         from ev
     ),
     daily as (
       select (ev.prev at time zone $3)::date as day,
              max(extract(epoch from ev.ts - ev.prev)) as gap
         from ev, latest
        where ev.prev is not null
          and extract(hour from ev.prev at time zone $3) = extract(hour from latest.ts at time zone $3)
        group by 1
     )
     select (extract(epoch from latest.ts) * 1000)::bigint as last_ms,
            latest.last_hour::int as last_hour,
            (select percentile_cont(0.5) within group (order by gap) from daily)::int as usual_s,
            (select count(*) from daily)::int as days
       from latest`,
    [tenantId, siteId, timezone || "UTC"],
  );
  return rows[0] ?? { last_ms: null, last_hour: 0, usual_s: null, days: 0 };
}
