import type { StoredEvent } from "./types";

/**
 * Compute a simple conversion funnel over live events. Each step matches a path
 * substring; a session "passes" a step if it has a pageview whose path contains
 * the match. Steps are cumulative (monotonic): the pool narrows to sessions
 * that passed every prior step. Pure — no store, no DB.
 */
export interface FunnelStepDef {
  label: string;
  match: string; // path substring, e.g. "/cart" or "confirmation"
}

export interface FunnelResult {
  total: number;
  steps: { label: string; match: string; sessions: number; rate: number }[];
}

export function computeFunnel(
  evs: StoredEvent[],
  steps: FunnelStepDef[],
): FunnelResult {
  const bySession = new Map<string, string[]>();
  for (const e of evs) {
    if (e.type !== "pageview") continue;
    const arr = bySession.get(e.sessionId);
    if (arr) arr.push(e.path);
    else bySession.set(e.sessionId, [e.path]);
  }
  const sessions = [...bySession.values()];
  const total = sessions.length;

  let pool = sessions;
  const out: FunnelResult["steps"] = [];
  for (const step of steps) {
    pool = pool.filter((paths) => paths.some((p) => p.includes(step.match)));
    out.push({
      label: step.label,
      match: step.match,
      sessions: pool.length,
      rate: total ? pool.length / total : 0,
    });
  }
  return { total, steps: out };
}
