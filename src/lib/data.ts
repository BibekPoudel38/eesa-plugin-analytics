import "server-only";
import { cache } from "react";
import * as live from "@/lib/live/aggregate";
import { rangeDays } from "@/lib/ranges";
import type { StoredEvent } from "@/lib/live/types";
import {
  loadCounts,
  loadEvents,
  loadRecentEvents,
  loadSurfaces,
  loadSurfaceTotals,
} from "@/lib/db/load";
import { listSites, getSite } from "@/lib/db/sites";
import { listGoals } from "@/lib/db/goals";
import { recordingIdsFor } from "@/lib/live/recordings";
import { listFunnels } from "@/lib/db/funnels";
import { computeFunnel, computeRetention } from "@/lib/funnels/compute";
import { computeGoalCards, type GoalCard } from "@/lib/goals/compute";
import * as appdb from "./db/app";
import { resolveCustomers } from "./eesa/directory";

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

/**
 * One window's events, loaded AT MOST ONCE per request.
 *
 * `cache()` memoises on the argument list for the lifetime of a single server
 * request. That matters because a page is not one getter: the overview awaits
 * `getOverview`, `getLiveStatus` and `getGoalCards` in sequence, and each one
 * used to run its own full load — the same ~135,000 rows and ~50 MB fetched,
 * parsed and thrown away three times over, sequentially, before the page could
 * render.
 *
 * Deliberately keyed on the ARGUMENTS rather than a time bucket: `Date.now()`
 * is read inside, so two getters in one request share a load, and the next
 * request still gets fresh data. Nothing is cached ACROSS requests — that would
 * be a correctness change to a live dashboard, not a performance one.
 */
const windowed = cache(async function windowed(
  tenantId: string,
  siteId: string,
  range?: string,
): Promise<{ evs: StoredEvent[]; span: [number, number] }> {
  const now = Date.now();
  const since = now - rangeDays(range) * DAY;
  const evs = await loadEvents(tenantId, siteId, since);
  return { evs, span: [since, now] };
});

export async function getLiveStatus(tenantId: string, siteId?: string) {
  const sites = await listSites(tenantId);
  if (!siteId) {
    return { live: false, eventCount: 0, visitors: 0, sessions: 0, sites, recent: [] };
  }
  // Last 30 days is enough to say "is this site live" + headline counts.
  //
  // Asked of the database rather than counted in JS. This used to load every
  // event in the window to produce three integers and eight rows — the single
  // most expensive thing on the page and the least justified, since none of the
  // per-event detail it fetched was ever looked at.
  const since = Date.now() - 30 * DAY;
  const [counts, recent] = await Promise.all([
    loadCounts(tenantId, siteId, since),
    loadRecentEvents(tenantId, siteId, since, 8),
  ]);
  return {
    live: counts.events > 0,
    eventCount: counts.events,
    visitors: counts.visitors,
    sessions: counts.sessions,
    sites,
    recent,
  };
}

/** Which surfaces are reporting for this tenant, and which have gone quiet.
 *
 *  The website and the app share one tracking key on purpose — a separate key
 *  would split the same customers across two dashboards and lose the funnel.
 *  The cost of that choice is that a broken app is invisible: its events simply
 *  stop arriving into a pile that is still busy with the website's.
 *
 *  Hence this. The site's own tracker reports `display_mode`, and the React
 *  Native client reports "app"; grouping on it is the only thing that can tell
 *  a dead integration from a quiet Tuesday.
 */
/** Who uses both surfaces, with names where the directory can supply them. */
export async function getCrossSurface(
  tenantId: string, siteId: string, range?: string,
) {
  const since = Date.now() - rangeDays(range) * DAY;
  const people = await appdb.loadCrossSurface(tenantId, siteId, since);
  const directory = await resolveCustomers(tenantId, people.map((p) => p.userId));
  return people.map((p) => ({ ...p, name: directory[p.userId]?.name ?? "" }));
}

export async function getSurfaces(tenantId: string, days = 7) {
  const since = Date.now() - days * DAY;
  const [sites, rows] = await Promise.all([
    listSites(tenantId),
    loadSurfaces(tenantId, since),
  ]);
  // Unknown is kept visible rather than folded into the website: it is
  // old-tracker traffic, and hiding it would overstate how much of the site is
  // reporting properly.
  return {
    days,
    sites: sites.map((s) => {
      const mine = rows.filter((r) => r.siteId === s.id);
      const surfaces = mine
        .map((r) => ({
          kind: r.kind,
          events: r.events,
          visitors: r.visitors,
          identified: r.identified,
          lastSeen: r.lastSeen,
          priorEvents: r.priorEvents,
          // Said here, once, rather than re-derived by every caller: it stopped
          // if it used to report and now does not.
          stopped: r.events === 0 && r.priorEvents > 0,
        }))
        .sort((a, b) => b.events - a.events);
      return {
        id: s.id,
        name: s.name,
        domain: s.domain,
        trackingKey: s.trackingKey,
        status: s.status,
        surfaces,
      };
    }),
  };
}

/** Everything the Web &amp; app page draws, for ONE surface at a time.
 *
 *  The website and the mobile app report through one tracking key on purpose,
 *  so a customer who browses on mobile web and orders in the app stays one
 *  person. Every other page here is better for that. This is where the bill is
 *  paid: merged into one stream a broken app is invisible, because it stops
 *  sending into traffic that is still busy.
 *
 *  The split is a filter over the same events the overview already loads, so
 *  every aggregation below is the one the rest of the dashboard uses. A second
 *  set of app-only maths would be a second set to keep true.
 */
/**
 * The app's people, and everything the app reports about what they bought.
 *
 * Two sources, deliberately separate: the analytics database says what
 * happened, and Eesa's directory says who it happened to. Neither can answer
 * the other's question, and the directory half is optional — when it is
 * unreachable every row still renders, keyed by the id it always had.
 */
/** "irvine " and "Irvine" are one place. A bare postcode is left alone. */
function cleanCity(raw: string): string {
  const t = (raw || "").trim().replace(/\s+/g, " ");
  if (!t || /^\d{5}(-\d{4})?$/.test(t)) return t;
  return t.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export async function getAppPeople(
  tenantId: string,
  siteId: string,
  range?: string,
  timezone = "UTC",
) {
  const now = Date.now();
  const since = now - rangeDays(range) * DAY;

  const [people, commerce, retention, lifetime] = await Promise.all([
    appdb.loadAppPeople(tenantId, siteId, since),
    appdb.loadAppCommerce(tenantId, siteId, since),
    appdb.loadAppRetention(tenantId, siteId, since, timezone),
    appdb.loadAppLifetime(tenantId, siteId),
  ]);
  const directory = await resolveCustomers(tenantId, people.map((p) => p.userId));

  const rows = people.map((p) => ({
    ...p,
    customer: directory[p.userId] ?? null,
    // Since the beginning, not since the date filter — see loadAppLifetime.
    lifetimeSpend: lifetime.get(p.userId)?.spend ?? 0,
    lifetimeOrders: lifetime.get(p.userId)?.orders ?? 0,
    firstEver: lifetime.get(p.userId)?.firstEver ?? p.firstSeen,
  }));
  const named = rows.filter((r) => r.customer?.name).length;

  // The shape of the audience, which is the question a restaurant actually
  // has. "179 people signed in" and "179 have a phone" say the same thing
  // twice; 18 who came back, 40 who ordered once and 121 who never ordered at
  // all are three different problems.
  const segments = {
    repeat: rows.filter((r) => r.orders > 1).length,
    once: rows.filter((r) => r.orders === 1).length,
    browsing: rows.filter((r) => r.orders === 0).length,
  };

  // Where people are, from the directory — the events themselves carry no geo
  // for the app at all (the mobile client posts server-side, so there is no
  // browser request to enrich), which is why the shared location panel reads
  // "Unknown" for every one of them.
  //
  // The column is free text and holds both — "Irvine", "Irvine " and "92882"
  // are all in there. Grouping it raw split one city across two bars and
  // ranked a postcode alongside a place name.
  const byCity = new Map<string, number>();
  let zipOnly = 0;
  let noCity = 0;
  for (const r of rows) {
    const city = cleanCity(r.customer?.city ?? "");
    if (!city) { noCity += 1; continue; }
    if (/^\d{5}(-\d{4})?$/.test(city)) { zipOnly += 1; continue; }
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
  }
  const cities = [...byCity.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return {
    span: [since, now] as [number, number],
    rows,
    commerce,
    cities,
    zipOnly,
    noCity,
    segments,
    retention,
    named,
    /** False when the directory answered nothing — worth saying on the page. */
    directoryUp: Object.keys(directory).length > 0 || people.length === 0,
  };
}

export async function getAppData(
  tenantId: string, siteId: string, range?: string, timezone = "UTC",
) {
  const now = Date.now();
  const since = now - rangeDays(range) * DAY;

  // Only the app's events are loaded. This page used to pull every event in
  // the window — 152,000 of them to render a page about 21,000 — and filter in
  // JavaScript, which is why it took so long to open. The website's half is
  // now four integers from the database rather than 75,000 rows nothing on
  // this page ever reads again.
  // The commerce half is what the app actually reports and nothing here read
  // until now: every add_to_cart, payment_started, place_order and
  // apply_coupon arrives with its properties attached. All aggregates, so the
  // extra detail costs one round trip rather than another 20,000 rows.
  const [app, totals, commerce, items, service, payment, coupons, kinds, clock] =
    await Promise.all([
    loadEvents(tenantId, siteId, since, 200_000, "app"),
    loadSurfaceTotals(tenantId, siteId, since),
    appdb.loadAppCommerce(tenantId, siteId, since),
    appdb.loadAppItems(tenantId, siteId, since),
    appdb.loadAppBreakdown(tenantId, siteId, since, "service_type"),
    appdb.loadAppBreakdown(tenantId, siteId, since, "payment_kind"),
    appdb.loadAppBreakdown(tenantId, siteId, since, "code", {
      event: "apply_coupon", sum: "discount_amount", limit: 8,
    }),
    appdb.loadAppEventKinds(tenantId, siteId, since),
    appdb.loadAppClock(tenantId, siteId, since, timezone),
  ]);
  const span: [number, number] = [since, now];

  // iOS vs Android, from the os the client reports. Counted over PEOPLE rather
  // than events: one phone opened forty times is one phone, and counting
  // events would make the chattiest platform look the biggest.
  const byOs = new Map<string, Set<string>>();
  const byDevice = new Map<string, Set<string>>();
  for (const e of app) {
    const os = e.os || "Unknown";
    if (!byOs.has(os)) byOs.set(os, new Set());
    byOs.get(os)!.add(e.visitorId);
    // Phone or tablet — the app reports it on every event and nothing read it.
    const dev = e.device || "Unknown";
    if (!byDevice.has(dev)) byDevice.set(dev, new Set());
    byDevice.get(dev)!.add(e.visitorId);
  }
  // "user_9ju5 place_order" is true and useless to somebody running a
  // restaurant. Only the dozen people in the feed are looked up, so this is one
  // small request, and it degrades to the short id when the directory is down.
  const activity = live.liveActivity(now, app);
  const feedNames = await resolveCustomers(
    tenantId, activity.map((a) => a.userId ?? "").filter(Boolean),
  );
  for (const item of activity) {
    const name = item.userId ? feedNames[item.userId]?.name : "";
    if (name) item.user = name;
    else if (item.userId) item.user = item.userId;
  }

  const rank = (m: Map<string, Set<string>>) =>
    [...m.entries()].map(([name, set]) => ({ name, value: set.size }))
      .sort((a, b) => b.value - a.value);
  const platforms = rank(byOs);
  const devices = rank(byDevice);

  return {
    span,
    app: totals.app,
    web: totals.web,
    hasApp: totals.app.events > 0,
    hasWeb: totals.web.events > 0,
    lastSeen: totals.app.lastSeen ? Date.parse(totals.app.lastSeen) : null,
    kpis: live.liveKpis(now, app),
    trend: live.liveTrend(app, span),
    // analytics.screen(route.name) arrives as a pageview whose path is the
    // screen name, so "top pages" is "top screens" without changing anything.
    screens: live.liveTopPages(app),
    // analytics.click(name) arrives as a custom event.
    taps: live.liveEvents(app),
    // No locations here. The mobile client makes no request carrying geo, so
    // every app event is "Unknown" — the page says that in words now, and
    // grouping twenty thousand rows to prove it was a pass for nothing.
    activity,
    platforms,
    devices,
    commerce,
    items,
    service,
    payment,
    coupons,
    kinds,
    clock,
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
