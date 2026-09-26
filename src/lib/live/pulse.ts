// How recently a site was visited, and how quiet it usually gets at this hour.
//
// Eesa watches a website from two sides. From its own server it asks "do you
// answer?" every minute. That cannot see a script that breaks in the browser,
// a DNS change that reaches some visitors and not others, or a page that loads
// for a robot and not for a person — and the only witness to those is the
// visitors themselves. When they stop arriving at an hour they never stop,
// something between them and the site is broken.
//
// So this answers with FACTS and leaves the verdict to the caller: when the
// last visitor arrived, how many arrived in the last hour, and how long the
// longest quiet spell normally is at the hour this one began. "Normally" is
// the median over the last 14 days of each day's longest spell — a median, not
// a maximum, so one past outage cannot teach the watch that a two-hour silence
// at lunchtime is ordinary.
//
// Pure: no database, no clock of its own. Tested by test/site-pulse.test.js.

/** One row of the pulse query in src/lib/db/pulse.ts. pg returns bigint as a string. */
export interface PulseRow {
  last_ms: string | number | null;
  last_hour: string | number | null;
  usual_s: string | number | null;
  days: string | number | null;
}

export interface Pulse {
  site: string;
  domain: string;
  timezone: string;
  /** When this was worked out, epoch ms. */
  checkedAt: number;
  /** The newest event of any kind, epoch ms; null when there is none in 14 days. */
  lastEventAt: number | null;
  /** Seconds since that event. */
  quietSec: number | null;
  /** Events in the last 60 minutes. */
  lastHour: number;
  /** Median of each day's longest quiet spell starting in the hour of day this one started. */
  usualQuietSec: number | null;
  /** How many days that median is taken over (at most 14). */
  days: number;
}

const count = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const orNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function shapePulse(
  row: PulseRow | null | undefined,
  site: { name: string; domain: string; timezone?: string },
  now: number,
): Pulse {
  const last = orNull(row?.last_ms);
  const usual = orNull(row?.usual_s);
  return {
    site: site.name,
    domain: site.domain,
    timezone: site.timezone || "UTC",
    checkedAt: now,
    lastEventAt: last,
    // An event stamped a moment ahead of this clock is "just now", not a
    // negative silence.
    quietSec: last === null ? null : Math.max(0, Math.round((now - last) / 1000)),
    lastHour: count(row?.last_hour),
    usualQuietSec: usual === null ? null : Math.max(0, Math.round(usual)),
    days: count(row?.days),
  };
}
