import "server-only";
import * as mock from "@/lib/mock/data";
import { hasLiveData, eventCount, allEvents } from "@/lib/live/store";
import * as live from "@/lib/live/aggregate";

/**
 * Single source of truth for the screens: serve real captured data once any
 * has arrived, otherwise the seeded demo dataset. Funnels and retention need
 * multi-day cohorts and instrumented conversion events, so they stay on demo
 * data until the product defines them — flagged in the UI.
 */

export function getLiveStatus() {
  const live = hasLiveData();
  const events = allEvents();
  return {
    live,
    eventCount: eventCount(),
    visitors: new Set(events.map((e) => e.visitorId)).size,
    sessions: new Set(events.map((e) => e.sessionId)).size,
  };
}

export function getOverview() {
  if (!hasLiveData()) {
    return {
      live: false,
      kpis: mock.kpis,
      trend: mock.trend,
      sources: mock.sources,
      topPages: mock.topPages,
      devices: mock.devices,
      activity: mock.activity,
    };
  }
  return {
    live: true,
    kpis: live.liveKpis(),
    trend: live.liveTrend(),
    sources: live.liveSources(),
    topPages: live.liveTopPages(),
    devices: live.liveDevices(),
    activity: live.liveActivity(),
  };
}

export function getHeatData() {
  if (!hasLiveData()) return { live: false, pages: mock.heatPages };
  const pages = live.liveHeatPages();
  // fall back if there were views but no click coordinates yet
  if (!pages.length || pages.every((p) => p.hotspots.length === 0)) {
    return { live: false, pages: mock.heatPages };
  }
  return { live: true, pages };
}

export function getSessionsData() {
  if (!hasLiveData()) return { live: false, sessions: mock.sessions };
  return { live: true, sessions: live.liveSessions() };
}

export function getSessionDetail(id: string) {
  const liveRow = live.liveSessionDetail(id);
  if (liveRow) return liveRow;
  return mock.sessions.find((s) => s.id === id) ?? null;
}

export function getFunnelsData() {
  return {
    live: hasLiveData(),
    // funnel + retention remain demo data (need defined conversion steps + cohorts)
    funnel: mock.funnel,
    retention: mock.retention,
    events: hasLiveData() ? live.liveEvents() : mock.events,
  };
}
