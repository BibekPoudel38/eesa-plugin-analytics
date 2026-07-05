import "server-only";
import { allEvents } from "./store";
import type { StoredEvent } from "./types";
import type {
  Kpi,
  PageRow,
  HeatPage,
  Hotspot,
  SessionRow,
  EventRow,
  ActivityItem,
} from "@/lib/mock/data";

/**
 * Turns the raw captured event stream into the same shapes the mock module
 * exports, so the screens don't care whether data is live or demo. Everything
 * here is pure over a snapshot of the store.
 */

type Grouped = Map<string, StoredEvent[]>;

function groupBy(events: StoredEvent[], key: (e: StoredEvent) => string): Grouped {
  const m: Grouped = new Map();
  for (const e of events) {
    const k = key(e);
    const arr = m.get(k);
    if (arr) arr.push(e);
    else m.set(k, [e]);
  }
  return m;
}

function bucketize(values: { ts: number }[], span: [number, number], buckets: number): number[] {
  const out = new Array(buckets).fill(0);
  const [min, max] = span;
  const width = Math.max(1, max - min);
  for (const v of values) {
    let i = Math.floor(((v.ts - min) / width) * buckets);
    if (i >= buckets) i = buckets - 1;
    if (i < 0) i = 0;
    out[i]++;
  }
  return out;
}

function timeSpan(events: StoredEvent[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const e of events) {
    if (e.ts < min) min = e.ts;
    if (e.ts > max) max = e.ts;
  }
  if (!isFinite(min)) return [0, 1];
  return [min, max || min + 1];
}

/** delta% comparing the recent half of the window to the older half. */
function splitDelta(
  events: StoredEvent[],
  span: [number, number],
  count: (evts: StoredEvent[]) => number,
): number {
  const mid = (span[0] + span[1]) / 2;
  const older = count(events.filter((e) => e.ts < mid));
  const recent = count(events.filter((e) => e.ts >= mid));
  if (older === 0) return recent > 0 ? 100 : 0;
  return ((recent - older) / older) * 100;
}

const uniq = (evts: StoredEvent[], f: (e: StoredEvent) => string) =>
  new Set(evts.map(f)).size;

// ---- sessions (the backbone of most aggregations) -------------------------

type SessionAgg = {
  id: string;
  visitorId: string;
  device: StoredEvent["device"];
  browser: string;
  referrer: string;
  firstTs: number;
  lastTs: number;
  pageviews: StoredEvent[];
  paths: string[];
  events: StoredEvent[];
  rage: number;
  converted: boolean;
};

function sessionize(events: StoredEvent[]): SessionAgg[] {
  const bySession = groupBy(events, (e) => e.sessionId);
  const out: SessionAgg[] = [];
  for (const [id, evts] of bySession) {
    evts.sort((a, b) => a.ts - b.ts);
    const pageviews = evts.filter((e) => e.type === "pageview");
    const paths: string[] = [];
    for (const p of pageviews) if (paths[paths.length - 1] !== p.path) paths.push(p.path);
    out.push({
      id,
      visitorId: evts[0].visitorId,
      device: evts[0].device,
      browser: evts[0].browser,
      referrer: evts[0].referrer,
      firstTs: evts[0].ts,
      lastTs: evts[evts.length - 1].ts,
      pageviews,
      paths: paths.length ? paths : [evts[0].path],
      events: evts,
      rage: evts.filter((e) => e.type === "rageclick").length,
      converted: evts.some((e) => e.type === "custom"),
    });
  }
  return out.sort((a, b) => b.lastTs - a.lastTs);
}

// ---- KPIs -----------------------------------------------------------------

export function liveKpis(now = Date.now()): Kpi[] {
  const events = allEvents();
  const span = timeSpan(events);
  const sessions = sessionize(events);
  const spanSpark = (f: (e: StoredEvent) => boolean) =>
    bucketize(events.filter(f), span, 14);

  const durations = sessions.map((s) => (s.lastTs - s.firstTs) / 1000);
  const avgDur = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;
  const bounced = sessions.filter((s) => s.pageviews.length <= 1).length;
  const bounceRate = sessions.length ? (bounced / sessions.length) * 100 : 0;
  const convertedSessions = sessions.filter((s) => s.converted).length;
  const convRate = sessions.length ? (convertedSessions / sessions.length) * 100 : 0;
  const rage = events.filter((e) => e.type === "rageclick").length;

  return [
    {
      key: "users",
      label: "Visitors",
      value: uniq(events, (e) => e.visitorId),
      format: "number",
      delta: splitDelta(events, span, (e) => uniq(e, (x) => x.visitorId)),
      goodUp: true,
      spark: spanSpark((e) => e.type === "pageview"),
    },
    {
      key: "sessions",
      label: "Sessions",
      value: sessions.length,
      format: "number",
      delta: splitDelta(events, span, (e) => uniq(e, (x) => x.sessionId)),
      goodUp: true,
      spark: spanSpark((e) => e.type === "pageview"),
    },
    {
      key: "duration",
      label: "Avg. session",
      value: Math.round(avgDur),
      format: "duration",
      delta: 0,
      goodUp: true,
      spark: spanSpark((e) => e.type === "click"),
    },
    {
      key: "bounce",
      label: "Bounce rate",
      value: Math.round(bounceRate * 10) / 10,
      format: "percent",
      delta: 0,
      goodUp: false,
      spark: spanSpark((e) => e.type === "pageview"),
    },
    {
      key: "conversion",
      label: "Conversions",
      value: Math.round(convRate * 10) / 10,
      format: "percent",
      delta: 0,
      goodUp: true,
      spark: spanSpark((e) => e.type === "custom"),
    },
    {
      key: "rage",
      label: "Rage clicks",
      value: rage,
      format: "number",
      delta: splitDelta(events, span, (e) => e.filter((x) => x.type === "rageclick").length),
      goodUp: false,
      spark: spanSpark((e) => e.type === "rageclick"),
    },
  ];
}

// ---- trend ----------------------------------------------------------------

export function liveTrend() {
  const events = allEvents();
  const span = timeSpan(events);
  const pv = events.filter((e) => e.type === "pageview");
  const buckets = 24;
  const sessions = new Array(buckets).fill(0);
  const seen: Set<string>[] = Array.from({ length: buckets }, () => new Set());
  const [min, max] = span;
  const width = Math.max(1, max - min);
  for (const e of pv) {
    let i = Math.floor(((e.ts - min) / width) * buckets);
    if (i >= buckets) i = buckets - 1;
    if (i < 0) i = 0;
    sessions[i]++;
    seen[i].add(e.visitorId);
  }
  return { days: buckets, sessions, users: seen.map((s) => s.size) };
}

// ---- sources --------------------------------------------------------------

function classifySource(referrer: string): string {
  if (!referrer) return "Direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "Referral";
  }
  if (/google\.|bing\.|duckduckgo\.|yahoo\./.test(host)) return "Organic search";
  if (/facebook\.|instagram\.|t\.co|twitter\.|x\.com|linkedin\.|reddit\.|tiktok\./.test(host))
    return "Social";
  if (host.includes("vercel.app") || host.includes("mom2mom")) return "Internal";
  return "Referral";
}

const sourceColor: Record<string, string> = {
  Direct: "var(--teal)",
  "Organic search": "var(--pine)",
  Social: "var(--amber)",
  Referral: "var(--clay)",
  Internal: "var(--muted-foreground)",
};

export function liveSources() {
  const sessions = sessionize(allEvents());
  const counts = new Map<string, number>();
  for (const s of sessions) {
    const src = classifySource(s.referrer);
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value, color: sourceColor[name] ?? "var(--ember)" }))
    .sort((a, b) => b.value - a.value);
}

// ---- top pages ------------------------------------------------------------

export function liveTopPages(): PageRow[] {
  const events = allEvents();
  const sessions = sessionize(events);
  const byPath = groupBy(
    events.filter((e) => e.type === "pageview"),
    (e) => e.path,
  );

  const rows: PageRow[] = [];
  for (const [path, pvs] of byPath) {
    // dwell: time from each pageview to the next event in the same session
    let dwellTotal = 0;
    let dwellN = 0;
    for (const pv of pvs) {
      const sess = sessions.find((s) => s.id === pv.sessionId);
      if (!sess) continue;
      const next = sess.events.find((e) => e.ts > pv.ts);
      if (next) {
        dwellTotal += Math.min((next.ts - pv.ts) / 1000, 600);
        dwellN++;
      }
    }
    const entrySessions = sessions.filter((s) => s.paths[0] === path);
    const bounced = entrySessions.filter((s) => s.pageviews.length <= 1).length;
    rows.push({
      path,
      title: pvs.find((p) => p.title)?.title ?? "",
      views: pvs.length,
      avgTime: dwellN ? Math.round(dwellTotal / dwellN) : 0,
      bounce: entrySessions.length ? Math.round((bounced / entrySessions.length) * 1000) / 10 : 0,
    });
  }
  return rows.sort((a, b) => b.views - a.views).slice(0, 10);
}

// ---- devices --------------------------------------------------------------

export function liveDevices() {
  const sessions = sessionize(allEvents());
  const counts = { Desktop: 0, Mobile: 0, Tablet: 0 };
  for (const s of sessions) counts[s.device]++;
  const total = sessions.length || 1;
  return (["Desktop", "Mobile", "Tablet"] as const).map((name) => ({
    name,
    value: Math.round((counts[name] / total) * 100),
  }));
}

// ---- live activity --------------------------------------------------------

function shortId(id: string) {
  return "user_" + id.slice(-4);
}

export function liveActivity(now = Date.now()): ActivityItem[] {
  const events = allEvents();
  const recent = [...events].sort((a, b) => b.ts - a.ts).slice(0, 12);
  return recent.map((e, i) => {
    const kind =
      e.type === "rageclick" || e.type === "deadclick"
        ? "friction"
        : e.type === "custom"
          ? "convert"
          : "browse";
    const action =
      e.type === "pageview"
        ? "viewed"
        : e.type === "click"
          ? "clicked"
          : e.type === "rageclick"
            ? "rage-clicked"
            : e.type === "deadclick"
              ? "dead-clicked"
              : e.type === "custom"
                ? e.name ?? "fired event"
                : e.type === "scroll"
                  ? "scrolled"
                  : "left";
    const target =
      e.type === "pageview" || e.type === "scroll" || e.type === "session_end"
        ? e.path
        : e.text || e.target || e.path;
    return {
      id: `${e.sessionId}-${e.ts}-${i}`,
      user: shortId(e.visitorId),
      action,
      target: target || e.path,
      minutesAgo: Math.max(0, (now - e.ts) / 60000),
      kind: kind as ActivityItem["kind"],
    };
  });
}

// ---- heatmaps -------------------------------------------------------------

const GRID_X = 16;
const GRID_Y = 10;

export function liveHeatPages(): HeatPage[] {
  const events = allEvents();
  const sessions = sessionize(events);
  const clickTypes = new Set(["click", "rageclick"]);
  const byPath = groupBy(
    events.filter((e) => e.type === "pageview"),
    (e) => e.path,
  );

  const pages: HeatPage[] = [];
  for (const [path, pvs] of byPath) {
    const clicks = events.filter(
      (e) => e.path === path && clickTypes.has(e.type) && e.x != null && e.y != null,
    );

    // grid-cluster clicks into hotspots
    const cells = new Map<string, { x: number; y: number; n: number; label?: string }>();
    for (const c of clicks) {
      const gx = Math.min(GRID_X - 1, Math.floor((c.x ?? 0) * GRID_X));
      const gy = Math.min(GRID_Y - 1, Math.floor((c.y ?? 0) * GRID_Y));
      const key = `${gx},${gy}`;
      const cell = cells.get(key);
      if (cell) {
        cell.n++;
      } else {
        cells.set(key, {
          x: (gx + 0.5) / GRID_X,
          y: (gy + 0.5) / GRID_Y,
          n: 1,
          label: c.text || c.target,
        });
      }
    }
    const maxN = Math.max(1, ...[...cells.values()].map((c) => c.n));
    const hotspots: Hotspot[] = [...cells.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map((c) => ({ x: c.x, y: c.y, weight: c.n / maxN, label: c.label }));

    // element ranking + rage rate
    const byTarget = new Map<string, { clicks: number; rage: number; label: string }>();
    for (const c of clicks) {
      const label = c.text || c.target || "(unknown)";
      const t = byTarget.get(label) ?? { clicks: 0, rage: 0, label };
      t.clicks++;
      if (c.type === "rageclick") t.rage++;
      byTarget.set(label, t);
    }
    const elements = [...byTarget.values()]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 6)
      .map((t) => ({
        label: t.label,
        clicks: t.clicks,
        rageRate: t.clicks ? Math.round((t.rage / t.clicks) * 1000) / 10 : 0,
      }));

    // scroll depth → reach at 0/25/50/75/100
    const entrySessions = sessions.filter((s) => s.paths.includes(path));
    const depths = events
      .filter((e) => e.path === path && e.type === "scroll" && e.depth != null)
      .map((e) => e.depth as number);
    const reachAt = (d: number) =>
      depths.length ? Math.round((depths.filter((x) => x >= d).length / depths.length) * 100) : 0;
    const scrollBands = [100, reachAt(25), reachAt(50), reachAt(75), reachAt(100)];
    const avgScroll = depths.length
      ? Math.round(depths.reduce((a, b) => a + b, 0) / depths.length)
      : 0;

    const deviceCounts = new Map<string, number>();
    for (const s of entrySessions) deviceCounts.set(s.device, (deviceCounts.get(s.device) ?? 0) + 1);
    const device =
      ([...deviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as HeatPage["device"]) ??
      "Desktop";

    pages.push({
      path,
      title: pvs.find((p) => p.title)?.title ?? "",
      views: pvs.length,
      device: device === "Mobile" ? "Mobile" : "Desktop",
      avgScroll,
      hotspots,
      elements,
      scrollBands,
    });
  }
  return pages.sort((a, b) => b.views - a.views);
}

// ---- sessions list --------------------------------------------------------

export function liveSessions(now = Date.now()): SessionRow[] {
  return sessionize(allEvents())
    .slice(0, 24)
    .map((s) => {
      const durationSec = Math.round((s.lastTs - s.firstTs) / 1000);
      const outcome: SessionRow["outcome"] = s.converted
        ? "Converted"
        : s.pageviews.length <= 1 && durationSec < 15
          ? "Bounced"
          : "Browsing";
      return {
        id: "s_" + s.id.slice(-5),
        user: shortId(s.visitorId),
        anon: true,
        location: "—",
        device: s.device,
        browser: s.browser,
        durationSec,
        pages: s.paths.length,
        events: s.events.length,
        rageClicks: s.rage,
        startedMinutesAgo: Math.max(0, (now - s.firstTs) / 60000),
        outcome,
        path: s.paths.slice(0, 6),
      };
    });
}

// ---- events table ---------------------------------------------------------

const typeLabel: Record<string, string> = {
  pageview: "page_view",
  click: "click",
  rageclick: "rage_click",
  deadclick: "dead_click",
  scroll: "scroll_depth",
  session_end: "session_end",
};

export function liveEvents(): EventRow[] {
  const events = allEvents();
  const span = timeSpan(events);
  const named = (e: StoredEvent) =>
    e.type === "custom" ? e.name ?? "custom" : typeLabel[e.type] ?? e.type;
  const byName = groupBy(events, named);

  const rows: EventRow[] = [];
  for (const [name, evts] of byName) {
    rows.push({
      name,
      count: evts.length,
      users: uniq(evts, (e) => e.visitorId),
      delta: splitDelta(evts, span, (e) => e.length),
      spark: bucketize(evts, span, 12),
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}
