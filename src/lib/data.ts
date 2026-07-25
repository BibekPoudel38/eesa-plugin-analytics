import "server-only";
import * as mock from "@/lib/mock/data";
import * as live from "@/lib/live/aggregate";
import { rangeDays } from "@/lib/ranges";
import type { StoredEvent } from "@/lib/live/types";
import { loadEvents } from "@/lib/db/load";
import { listSites, getSite } from "@/lib/db/sites";

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
  const { evs } = await windowed(tenantId, siteId, range);
  return { live: true, sessions: live.liveSessions(Date.now(), evs) };
}

export async function getSessionDetail(
  tenantId: string,
  siteId: string,
  id: string,
) {
  const { evs } = await windowed(tenantId, siteId, "90d");
  return live.liveSessionDetail(id, Date.now(), evs) ?? null;
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
) {
  const { evs } = await windowed(tenantId, siteId, range);
  return {
    live: true,
    // funnel + retention remain demo shapes until per-site funnel definitions
    // land (P4 — the `funnels` table is already provisioned).
    funnel: mock.funnel,
    retention: mock.retention,
    events: live.liveEvents(evs),
  };
}

/** Convenience for endpoints: confirm the site belongs to the tenant. */
export async function assertSite(tenantId: string, siteId: string) {
  const site = await getSite(tenantId, siteId);
  return site;
}
