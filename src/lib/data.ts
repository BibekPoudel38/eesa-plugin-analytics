import "server-only";
import * as live from "@/lib/live/aggregate";
import { rangeDays } from "@/lib/ranges";
import type { StoredEvent } from "@/lib/live/types";
import { loadEvents } from "@/lib/db/load";
import { listSites, getSite } from "@/lib/db/sites";
import { listGoals } from "@/lib/db/goals";
import { recordingIdsFor } from "@/lib/live/recordings";
import { listFunnels } from "@/lib/db/funnels";
import { computeFunnel, computeRetention } from "@/lib/funnels/compute";
import { computeGoalCards, type GoalCard } from "@/lib/goals/compute";

const DAY = 86_400_000;

/**
 * The screens' single data seam — now TENANT + SITE scoped. Every getter takes
 * the verified tenant id (from the Eesa token) and the selected site id, loads
 * that slice from Timescale, and runs the existing pure aggregators over it.
 * Return shapes are byte-for-byte what the components already render.
 *
 * A site with no events yet renders a real (empty) live state — not another
 * brand's demo data. `funnel`/`retention` stay on demo shapes until per-site
 * funnel definitions land (P4); the event table goes live.
 */

async function windowed(
  tenantId: string,
  siteId: string,
  range?: string,
): Promise<{ evs: StoredEvent[]; span: [number, number] }> {
  const now = Date.now();
  const since = now - rangeDays(range) * DAY;
  const evs = await loadEvents(tenantId, siteId, since);
  return { evs, span: [since, now] };
}

export async function getLiveStatus(tenantId: string, siteId?: string) {
  const sites = await listSites(tenantId);
  if (!siteId) {
    return { live: false, eventCount: 0, visitors: 0, sessions: 0, sites, recent: [] };
  }
  // Last 30 days is enough to say "is this site live" + headline counts.
  const { evs } = await windowed(tenantId, siteId, "30d");
  const recent = evs
    .slice(-8)
    .reverse()
    .map((e) => ({
      type: e.type,
      path: e.path,
      label: e.type === "custom" ? (e.name ?? "custom") : (e.title ?? e.path),
      ts: e.recvTs,
    }));
  return {
    live: evs.length > 0,
    eventCount: evs.length,
    visitors: new Set(evs.map((e) => e.visitorId)).size,
    sessions: new Set(evs.map((e) => e.sessionId)).size,
    sites,
    recent,
  };
}

export async function getOverview(
  tenantId: string,
  siteId: string,
  range?: string,
) {
  const now = Date.now();
  const { evs, span } = await windowed(tenantId, siteId, range);
  return {
    live: true,
    kpis: live.liveKpis(now, evs),
    trend: live.liveTrend(evs, span),
    sources: live.liveSources(evs),
    topPages: live.liveTopPages(evs),
    devices: live.liveDevices(evs),
    locations: live.liveLocations(evs),
    activity: live.liveActivity(now, evs),
  };
}

export async function getHeatData(
  tenantId: string,
  siteId: string,
  range?: string,
) {
  const { evs } = await windowed(tenantId, siteId, range);
  return { live: true, pages: live.liveHeatPages(evs) };
}

export async function getSessionsData(
  tenantId: string,
  siteId: string,
  range?: string,
) {
  const [{ evs }, recIds] = await Promise.all([
    windowed(tenantId, siteId, range),
    // Scoped to THIS tenant+site — a replay from another tenant can never mark
    // a row as watchable here.
    recordingIdsFor(tenantId, siteId),
  ]);
  return { live: true, sessions: live.liveSessions(Date.now(), evs, recIds) };
}

export async function getSessionDetail(
  tenantId: string,
  siteId: string,
  id: string,
) {
  const [{ evs }, recIds] = await Promise.all([
    windowed(tenantId, siteId, "90d"),
    recordingIdsFor(tenantId, siteId),
  ]);
  return live.liveSessionDetail(id, Date.now(), evs, recIds) ?? null;
}

export type Visitor = {
  key: string;
  name: string;
  anon: boolean;
  location: string;
  device: "Desktop" | "Mobile" | "Tablet";
  browser: string;
  os: string;
  source: string;
  sessions: number;
  events: number;
  rageClicks: number;
  lastSeenMinutesAgo: number;
  converted: boolean;
  completed: boolean;
  inCart: boolean;
  hasRecording: boolean;
  sessionId: string;
};

/** Roll the session list up into distinct visitors (shape unchanged). */
export async function getVisitorsData(
  tenantId: string,
  siteId: string,
  range?: string,
) {
  const { sessions } = await getSessionsData(tenantId, siteId, range);

  const byVisitor = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = s.user === "Anonymous" ? `anon:${s.id}` : `user:${s.user}`;
    const bucket = byVisitor.get(key);
    if (bucket) bucket.push(s);
    else byVisitor.set(key, [s]);
  }

  const visitors: Visitor[] = [...byVisitor.entries()].map(([key, rows]) => {
    const ordered = [...rows].sort(
      (a, b) => a.startedMinutesAgo - b.startedMinutesAgo,
    );
    const latest = ordered[0];
    const location =
      ordered.map((r) => r.location).find((l) => l && l !== "—") ?? "—";
    const source =
      ordered.map((r) => r.source).find((s) => s && s !== "Direct") ??
      latest.source ??
      "Direct";
    return {
      key,
      name: latest.user,
      anon: latest.anon,
      location,
      device: latest.device,
      browser: latest.browser,
      os: latest.os ?? "—",
      source,
      sessions: rows.length,
      events: rows.reduce((n, r) => n + r.events, 0),
      rageClicks: rows.reduce((n, r) => n + r.rageClicks, 0),
      lastSeenMinutesAgo: latest.startedMinutesAgo,
      converted: rows.some((r) => r.outcome === "Converted"),
      completed: rows.some((r) => r.completed),
      inCart: rows.some((r) => r.inCart),
      hasRecording: rows.some((r) => r.hasRecording),
      sessionId: latest.replayId ?? latest.id,
    };
  });

  visitors.sort((a, b) => a.lastSeenMinutesAgo - b.lastSeenMinutesAgo);
  return { live: true, visitors };
}

export async function getFunnelsData(
  tenantId: string,
  siteId: string,
  range?: string,
  funnelId?: string,
) {
  const [{ evs }, funnels] = await Promise.all([
    windowed(tenantId, siteId, range),
    listFunnels(tenantId, siteId),
  ]);

  // The tenant's chosen funnel, or their first. Both were `mock.funnel` until
  // now — the engine and the `funnels` table had existed all along, but only
  // the MCP/agent surface was ever wired to them, so the dashboard showed a
  // demo while the agent could compute the real thing.
  const chosen = funnels.find((f) => f.id === funnelId) ?? funnels[0] ?? null;
  const goalEvents = evs.map((e) => ({
    type: e.type,
    path: e.path,
    name: e.name ?? null,
    sessionId: e.sessionId,
  }));
  const computed = chosen ? computeFunnel(goalEvents, chosen.steps) : null;

  return {
    live: true,
    funnels: funnels.map((f) => ({ id: f.id, name: f.name, steps: f.steps })),
    funnel: computed && chosen
      ? { id: chosen.id, name: chosen.name, window: rangeLabel(range), steps: computed.steps, overall: computed.overall, total: computed.total }
      : null,
    retention: computeRetention(
      evs.map((e) => ({ visitorId: e.visitorId, ts: e.recvTs })),
      Date.now(),
    ),
    events: live.liveEvents(evs),
  };
}

/** "Last 30 days" style label for the funnel panel's subtitle. */
function rangeLabel(range?: string): string {
  const d = rangeDays(range);
  return d === 1 ? "Today" : `Last ${d} days`;
}

/**
 * Tenant-defined conversion cards for the overview.
 *
 * Replaces the hardcoded `completed` / `inCart` heuristics, which guessed at a
 * business from English path fragments. Returns [] when the tenant has not
 * defined any goals yet — an empty card row, not invented numbers.
 */
export async function getGoalCards(
  tenantId: string,
  siteId: string,
  range?: string,
): Promise<GoalCard[]> {
  const [{ evs }, goals] = await Promise.all([
    windowed(tenantId, siteId, range),
    listGoals(tenantId, siteId),
  ]);
  return computeGoalCards(
    evs.map((e) => ({
      type: e.type,
      path: e.path,
      name: e.name ?? null,
      sessionId: e.sessionId,
    })),
    goals,
  );
}

/** Convenience for endpoints: confirm the site belongs to the tenant. */
export async function assertSite(tenantId: string, siteId: string) {
  const site = await getSite(tenantId, siteId);
  return site;
}
