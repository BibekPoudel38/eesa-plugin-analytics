/**
 * Funnels + retention. PURE — executed for real by compute.verify.mjs.
 *
 * FUNNEL STEPS ARE GOAL RULES. A step is `{label} + GoalRule`, the exact shape a
 * conversion card uses, so "reached checkout" is defined once and a funnel step
 * and a goal card can never quietly disagree about what it means. The old engine
 * matched a bare path substring only; reusing the goal matcher gets
 * starts-with / exact / custom-event steps for free.
 *
 * Steps are MONOTONIC: the pool narrows to sessions that passed every prior
 * step, which is what makes a funnel a funnel rather than five independent
 * counts. Counting is per SESSION, matching goals and the previous engine.
 */

import { matchesRule, type GoalEvent, type GoalRule } from "@/lib/goals/compute";

export interface FunnelStepDef extends GoalRule {
  label: string;
}

/** What the FunnelChart renders. `users` is the render contract's field name;
 *  the number in it is SESSIONS — see the note above. */
export interface FunnelStepResult {
  label: string;
  users: number;
}

export interface FunnelResult {
  total: number;
  steps: FunnelStepResult[];
  /** First step → last step, 0..1. Zero when the first step caught nothing. */
  overall: number;
}

function bySession(evs: GoalEvent[]): Map<string, GoalEvent[]> {
  const m = new Map<string, GoalEvent[]>();
  for (const e of evs) {
    if (!e?.sessionId) continue;
    const arr = m.get(e.sessionId);
    if (arr) arr.push(e);
    else m.set(e.sessionId, [e]);
  }
  return m;
}

export function computeFunnel(
  evs: GoalEvent[],
  steps: FunnelStepDef[],
): FunnelResult {
  const sessions = [...bySession(evs || []).values()];
  const total = sessions.length;

  let pool = sessions;
  const out: FunnelStepResult[] = [];
  for (const step of steps || []) {
    pool = pool.filter((events) => events.some((e) => matchesRule(step, e)));
    out.push({ label: step.label, users: pool.length });
  }
  const first = out.length ? out[0].users : 0;
  const last = out.length ? out[out.length - 1].users : 0;
  return { total, steps: out, overall: first ? last / first : 0 };
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Weekly retention cohorts.
 *
 * A visitor belongs to the cohort of the week they were FIRST seen in the
 * window. `values[k]` is the share of that cohort with any activity k weeks
 * later — so `values[0]` is always 100.
 *
 * Cells that have not happened yet are `null`, NOT 0. The distinction is the
 * whole point of a retention grid: a cohort two weeks old genuinely has no
 * week-3 number, and rendering that as 0% would read as total churn.
 *
 * `now` is injected so this is deterministic and testable.
 */

export interface RetentionEvent {
  visitorId: string;
  ts: number;
}

export interface RetentionResult {
  weeks: string[];
  cohorts: { label: string; size: number; values: (number | null)[] }[];
}

const WEEK_MS = 7 * 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** UTC Monday 00:00 of the week containing `ts`. UTC so a cohort boundary does
 *  not move with the server's timezone or a DST change. */
export function weekStart(ts: number): number {
  const d = new Date(ts);
  const day = d.getUTCDay(); // 0 = Sunday
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    (day === 0 ? 6 : day - 1) * 86_400_000;
  return monday;
}

const weekLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

export function computeRetention(
  evs: RetentionEvent[],
  now: number,
  weekCount = 5,
): RetentionResult {
  const weeks = Array.from({ length: weekCount }, (_, i) => `W${i}`);
  const rows = (evs || []).filter((e) => e?.visitorId && Number.isFinite(e.ts));
  if (!rows.length) return { weeks, cohorts: [] };

  // first-seen week per visitor, and the set of weeks they were active in
  const firstWeek = new Map<string, number>();
  const activeWeeks = new Map<string, Set<number>>();
  for (const e of rows) {
    const w = weekStart(e.ts);
    const prev = firstWeek.get(e.visitorId);
    if (prev === undefined || w < prev) firstWeek.set(e.visitorId, w);
    const set = activeWeeks.get(e.visitorId);
    if (set) set.add(w);
    else activeWeeks.set(e.visitorId, new Set([w]));
  }

  // group visitors into cohorts by first-seen week
  const cohortOf = new Map<number, string[]>();
  for (const [visitor, w] of firstWeek) {
    const arr = cohortOf.get(w);
    if (arr) arr.push(visitor);
    else cohortOf.set(w, [visitor]);
  }

  const thisWeek = weekStart(now);
  const starts = [...cohortOf.keys()].sort((a, b) => a - b).slice(-weekCount);

  return {
    weeks,
    cohorts: starts.map((start) => {
      const members = cohortOf.get(start) ?? [];
      const values: (number | null)[] = [];
      for (let k = 0; k < weekCount; k++) {
        const target = start + k * WEEK_MS;
        // Hasn't happened yet — no number exists, so don't invent a zero.
        if (target > thisWeek) {
          values.push(null);
          continue;
        }
        const back = members.filter((v) => activeWeeks.get(v)?.has(target)).length;
        values.push(members.length ? Math.round((back / members.length) * 100) : 0);
      }
      return { label: weekLabel(start), size: members.length, values };
    }),
  };
}
