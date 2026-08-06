/**
 * Goals — tenant-defined conversion cards.
 *
 * PURE. No DB, no store, no `server-only`: this module is the whole matching
 * and counting rule, so it can be run for real by goals.verify.mjs and reused
 * anywhere (dashboard cards, funnel steps, the MCP surface).
 *
 * WHY THIS EXISTS. "Converted" used to be a hardcoded list of English path
 * fragments — "confirmation", "thank", "success", "cart", "checkout" — applied
 * to every tenant. That is a guess about someone else's business: a burrito
 * shop measuring /menu/burrito, a Spanish site with /gracias, or anyone whose
 * checkout is a modal, all measured zero and had no way to fix it. A goal is
 * now whatever the tenant's own IT person declares it to be.
 *
 * COUNTING. A goal counts SESSIONS, matching how `computeFunnel` counts, so a
 * goal card and a funnel step built on the same rule can never disagree. The
 * rate is that count over the sessions in the same window.
 */

export type GoalKind = "path" | "event";
export type GoalOperator = "contains" | "starts_with" | "exact";

export interface GoalRule {
  kind: GoalKind;
  /** Path rules only; an event rule is always an exact name match. */
  operator: GoalOperator;
  value: string;
}

export interface Goal extends GoalRule {
  id: string;
  name: string;
  icon?: string;
  position?: number;
  active?: boolean;
}

/** The only fields a goal looks at — keeps this decoupled from StoredEvent. */
export interface GoalEvent {
  type: string;
  path?: string;
  name?: string | null;
  sessionId: string;
}

export interface GoalCard {
  id: string;
  name: string;
  icon: string;
  kind: GoalKind;
  operator: GoalOperator;
  value: string;
  /** Sessions that met the rule in this window. */
  sessions: number;
  /** Sessions in the window, i.e. what `sessions` is a share of. */
  totalSessions: number;
  /** sessions / totalSessions, 0..1. Zero when the window is empty. */
  rate: number;
}

/** Case- and slash-insensitive, so "/Checkout/" and "checkout" are one thing. */
const fold = (v: unknown) => String(v ?? "").trim().toLowerCase();
const foldPath = (v: unknown) => {
  const s = fold(v);
  // A trailing slash is not a different page. Keep a bare "/" as itself.
  return s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s;
};

export const GOAL_KINDS: GoalKind[] = ["path", "event"];
export const GOAL_OPERATORS: GoalOperator[] = ["contains", "starts_with", "exact"];

/** Does one event satisfy this rule? */
export function matchesRule(rule: GoalRule, ev: GoalEvent): boolean {
  const needle = fold(rule.value);
  if (!needle) return false; // an empty rule matches NOTHING, never everything

  if (rule.kind === "event") {
    // Custom events are identified by name, so the operator does not apply —
    // a partial event-name match would silently fold "signup" into
    // "signup_failed", which is the opposite of what the card claims.
    return ev.type === "custom" && fold(ev.name) === needle;
  }

  // Path rules mean "reached this page", so only pageviews count. Clicks and
  // scrolls carry a path too; counting them would let a session match a page
  // it merely clicked something on.
  if (ev.type !== "pageview") return false;
  const path = foldPath(ev.path);
  const want = foldPath(needle);
  if (!path) return false;
  if (rule.operator === "exact") return path === want;
  if (rule.operator === "starts_with") return path.startsWith(want);
  return path.includes(want); // "contains" — the default
}

/** Session ids that satisfy the rule at least once. */
export function matchingSessions(evs: GoalEvent[], rule: GoalRule): Set<string> {
  const hit = new Set<string>();
  for (const ev of evs) {
    if (!ev || !ev.sessionId) continue;
    if (hit.has(ev.sessionId)) continue; // already counted — one hit is enough
    if (matchesRule(rule, ev)) hit.add(ev.sessionId);
  }
  return hit;
}

/** Every session present in the window, i.e. the denominator for every card. */
export function totalSessions(evs: GoalEvent[]): number {
  const ids = new Set<string>();
  for (const ev of evs) if (ev?.sessionId) ids.add(ev.sessionId);
  return ids.size;
}

/**
 * Cards for the overview, in the tenant's chosen order.
 *
 * Inactive goals are skipped rather than shown at zero — a paused card reading
 * "0" is indistinguishable from a broken one.
 */
export function computeGoalCards(evs: GoalEvent[], goals: Goal[]): GoalCard[] {
  const total = totalSessions(evs);
  return (goals || [])
    .filter((g) => g && g.active !== false)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
    .map((g) => {
      const n = matchingSessions(evs, g).size;
      return {
        id: g.id,
        name: g.name,
        icon: g.icon || "",
        kind: g.kind,
        operator: g.operator,
        value: g.value,
        sessions: n,
        totalSessions: total,
        rate: total ? n / total : 0,
      };
    });
}

/**
 * Validate a goal coming off the wire. Returns a clean rule or an error string
 * — never throws, and never trusts the client's kind/operator.
 */
export function validateGoalInput(input: {
  name?: unknown;
  kind?: unknown;
  operator?: unknown;
  value?: unknown;
}): { ok: true; value: { name: string; kind: GoalKind; operator: GoalOperator; value: string } } | { ok: false; error: string } {
  const name = String(input?.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  if (name.length > 60) return { ok: false, error: "name must be 60 characters or fewer" };

  const kind = String(input?.kind ?? "path").trim().toLowerCase() as GoalKind;
  if (!GOAL_KINDS.includes(kind)) return { ok: false, error: "kind must be 'path' or 'event'" };

  // An event rule has no operator; pin it so a stored row can't imply one.
  const rawOp = String(input?.operator ?? "contains").trim().toLowerCase() as GoalOperator;
  const operator: GoalOperator = kind === "event" ? "exact" : rawOp;
  if (!GOAL_OPERATORS.includes(operator)) {
    return { ok: false, error: "operator must be 'contains', 'starts_with' or 'exact'" };
  }

  const value = String(input?.value ?? "").trim();
  if (!value) {
    return {
      ok: false,
      error: kind === "event" ? "event name is required" : "path is required",
    };
  }
  if (value.length > 300) return { ok: false, error: "value must be 300 characters or fewer" };

  return { ok: true, value: { name, kind, operator, value } };
}
