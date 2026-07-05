/**
 * Mock analytics data for the Chups demo workspace.
 *
 * The tracked product is "Sprout" — a small indie habit-tracking app. Numbers
 * are sized for an early-stage startup (~1.3k monthly users). Everything is
 * generated with a seeded PRNG so the server and client render identically
 * (no hydration mismatch) — swap this whole module for the real API later.
 */

// ---- deterministic pseudo-randomness -------------------------------------

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(seed: number, count: number, min: number, max: number, drift = 0) {
  const rand = mulberry32(seed);
  const out: number[] = [];
  let base = min + (max - min) * 0.5;
  for (let i = 0; i < count; i++) {
    base += (rand() - 0.5) * (max - min) * 0.4 + drift;
    base = Math.max(min, Math.min(max, base));
    out.push(Math.round(base));
  }
  return out;
}

// ---- workspace ------------------------------------------------------------

export const workspace = {
  name: "Sprout",
  domain: "sprout.app",
  plan: "Indie",
  environments: ["Production", "Staging"],
  ranges: ["Today", "Last 7 days", "Last 30 days", "Last 90 days"],
  defaultRange: "Last 30 days",
};

// ---- KPI tiles (dashboard) -----------------------------------------------

export type Kpi = {
  key: string;
  label: string;
  value: number;
  format: "number" | "duration" | "percent";
  delta: number; // % change vs previous period
  goodUp: boolean; // is an increase good?
  spark: number[];
};

export const kpis: Kpi[] = [
  {
    key: "users",
    label: "Active users",
    value: 1284,
    format: "number",
    delta: 12.4,
    goodUp: true,
    spark: series(11, 14, 34, 72, 0.6),
  },
  {
    key: "sessions",
    label: "Sessions",
    value: 3421,
    format: "number",
    delta: 8.1,
    goodUp: true,
    spark: series(22, 14, 92, 168, 0.8),
  },
  {
    key: "duration",
    label: "Avg. session",
    value: 161,
    format: "duration",
    delta: 4.7,
    goodUp: true,
    spark: series(33, 14, 120, 210),
  },
  {
    key: "bounce",
    label: "Bounce rate",
    value: 41.2,
    format: "percent",
    delta: -3.2,
    goodUp: false,
    spark: series(44, 14, 38, 52),
  },
  {
    key: "conversion",
    label: "Signup rate",
    value: 3.8,
    format: "percent",
    delta: 0.6,
    goodUp: true,
    spark: series(55, 14, 2, 6),
  },
  {
    key: "rage",
    label: "Rage clicks",
    value: 214,
    format: "number",
    delta: -18.0,
    goodUp: false,
    spark: series(66, 14, 4, 18),
  },
];

// ---- main trend (30 days) -------------------------------------------------

export const trend = {
  days: 30,
  sessions: series(101, 30, 78, 172, 0.7),
  users: series(202, 30, 28, 78, 0.5),
};

// ---- traffic sources ------------------------------------------------------

export const sources = [
  { name: "Direct", value: 1187, color: "var(--teal)" },
  { name: "Organic search", value: 964, color: "var(--pine)" },
  { name: "Product Hunt", value: 612, color: "var(--ember)" },
  { name: "Social", value: 388, color: "var(--amber)" },
  { name: "Referral", value: 184, color: "var(--clay)" },
  { name: "Email", value: 86, color: "var(--muted-foreground)" },
];

// ---- top pages ------------------------------------------------------------

export type PageRow = {
  path: string;
  title: string;
  views: number;
  avgTime: number; // seconds
  bounce: number; // %
};

export const topPages: PageRow[] = [
  { path: "/", title: "Home", views: 2140, avgTime: 42, bounce: 46.0 },
  { path: "/pricing", title: "Pricing", views: 1284, avgTime: 88, bounce: 31.2 },
  { path: "/signup", title: "Create account", views: 742, avgTime: 61, bounce: 22.8 },
  { path: "/features", title: "Features", views: 688, avgTime: 74, bounce: 38.4 },
  { path: "/app", title: "Dashboard", views: 512, avgTime: 214, bounce: 12.1 },
  { path: "/blog/launch", title: "We're live on PH", views: 431, avgTime: 132, bounce: 54.6 },
  { path: "/changelog", title: "Changelog", views: 296, avgTime: 68, bounce: 40.3 },
  { path: "/login", title: "Log in", views: 254, avgTime: 34, bounce: 18.0 },
];

// ---- devices --------------------------------------------------------------

export const devices = [
  { name: "Desktop", value: 58 },
  { name: "Mobile", value: 36 },
  { name: "Tablet", value: 6 },
];

// ---- live activity feed ---------------------------------------------------

export type ActivityItem = {
  id: string;
  user: string;
  action: string;
  target: string;
  minutesAgo: number;
  kind: "convert" | "friction" | "browse";
};

export const activity: ActivityItem[] = [
  { id: "a1", user: "Mara K.", action: "completed signup", target: "/signup", minutesAgo: 2, kind: "convert" },
  { id: "a2", user: "Anonymous", action: "rage-clicked", target: "Pricing toggle", minutesAgo: 6, kind: "friction" },
  { id: "a3", user: "devon@…", action: "created first habit", target: "/app", minutesAgo: 11, kind: "convert" },
  { id: "a4", user: "Anonymous", action: "viewed", target: "/features", minutesAgo: 18, kind: "browse" },
  { id: "a5", user: "Priya S.", action: "started checkout", target: "/pricing", minutesAgo: 24, kind: "convert" },
  { id: "a6", user: "Anonymous", action: "dead-clicked", target: "Hero video", minutesAgo: 33, kind: "friction" },
  { id: "a7", user: "leo.m", action: "viewed", target: "/changelog", minutesAgo: 41, kind: "browse" },
];

// ---- heatmap pages --------------------------------------------------------

export type Hotspot = { x: number; y: number; weight: number; label?: string };

export type HeatPage = {
  path: string;
  title: string;
  views: number;
  device: "Desktop" | "Mobile";
  avgScroll: number; // % of page reached on average
  hotspots: Hotspot[];
  elements: { label: string; clicks: number; rageRate: number }[];
  scrollBands: number[]; // reach % at 0,25,50,75,100 depth
};

export const heatPages: HeatPage[] = [
  {
    path: "/",
    title: "Home",
    views: 2140,
    device: "Desktop",
    avgScroll: 58,
    hotspots: [
      { x: 0.5, y: 0.18, weight: 1, label: "Start free — CTA" },
      { x: 0.5, y: 0.09, weight: 0.55, label: "Nav: Pricing" },
      { x: 0.32, y: 0.44, weight: 0.7, label: "Feature card 1" },
      { x: 0.68, y: 0.44, weight: 0.52, label: "Feature card 2" },
      { x: 0.5, y: 0.72, weight: 0.4, label: "Testimonial" },
      { x: 0.82, y: 0.09, weight: 0.33, label: "Log in" },
    ],
    elements: [
      { label: "“Start free” hero button", clicks: 1042, rageRate: 1.2 },
      { label: "Pricing (nav)", clicks: 486, rageRate: 0.4 },
      { label: "Feature card — Streaks", clicks: 331, rageRate: 2.1 },
      { label: "Hero product video", clicks: 208, rageRate: 14.6 },
      { label: "Footer — Twitter", clicks: 96, rageRate: 0.0 },
    ],
    scrollBands: [100, 88, 71, 52, 34],
  },
  {
    path: "/pricing",
    title: "Pricing",
    views: 1284,
    device: "Desktop",
    avgScroll: 74,
    hotspots: [
      { x: 0.5, y: 0.14, weight: 0.6, label: "Monthly / annual toggle" },
      { x: 0.34, y: 0.42, weight: 0.55, label: "Free plan" },
      { x: 0.66, y: 0.42, weight: 1, label: "Pro plan — Choose" },
      { x: 0.5, y: 0.78, weight: 0.35, label: "FAQ" },
    ],
    elements: [
      { label: "“Choose Pro” button", clicks: 604, rageRate: 0.8 },
      { label: "Billing toggle (monthly/annual)", clicks: 512, rageRate: 22.4 },
      { label: "Free plan — Get started", clicks: 288, rageRate: 1.1 },
      { label: "FAQ — “Can I cancel?”", clicks: 141, rageRate: 0.0 },
    ],
    scrollBands: [100, 94, 86, 72, 58],
  },
  {
    path: "/signup",
    title: "Create account",
    views: 742,
    device: "Mobile",
    avgScroll: 91,
    hotspots: [
      { x: 0.5, y: 0.3, weight: 0.7, label: "Email field" },
      { x: 0.5, y: 0.44, weight: 0.66, label: "Password field" },
      { x: 0.5, y: 0.6, weight: 1, label: "Create account" },
      { x: 0.5, y: 0.74, weight: 0.3, label: "Continue with Google" },
    ],
    elements: [
      { label: "“Create account” button", clicks: 521, rageRate: 3.4 },
      { label: "Password field", clicks: 498, rageRate: 6.2 },
      { label: "Continue with Google", clicks: 233, rageRate: 1.0 },
      { label: "Terms link", clicks: 44, rageRate: 0.0 },
    ],
    scrollBands: [100, 99, 97, 94, 88],
  },
];

// ---- sessions -------------------------------------------------------------

export type SessionRow = {
  id: string;
  user: string;
  anon: boolean;
  location: string;
  device: "Desktop" | "Mobile" | "Tablet";
  browser: string;
  durationSec: number;
  pages: number;
  events: number;
  rageClicks: number;
  startedMinutesAgo: number;
  outcome: "Converted" | "Bounced" | "Browsing";
  path: string[]; // page journey
};

export const sessions: SessionRow[] = [
  { id: "s_9f2a1", user: "Mara K.", anon: false, location: "Berlin, DE", device: "Desktop", browser: "Chrome", durationSec: 284, pages: 6, events: 22, rageClicks: 0, startedMinutesAgo: 2, outcome: "Converted", path: ["/", "/features", "/pricing", "/signup", "/app"] },
  { id: "s_7c114", user: "Anonymous", anon: true, location: "Austin, US", device: "Mobile", browser: "Safari", durationSec: 41, pages: 2, events: 5, rageClicks: 3, startedMinutesAgo: 6, outcome: "Bounced", path: ["/", "/pricing"] },
  { id: "s_3be09", user: "devon@…", anon: false, location: "Toronto, CA", device: "Desktop", browser: "Firefox", durationSec: 512, pages: 9, events: 41, rageClicks: 1, startedMinutesAgo: 11, outcome: "Converted", path: ["/", "/signup", "/app"] },
  { id: "s_1d7f8", user: "Anonymous", anon: true, location: "London, UK", device: "Desktop", browser: "Chrome", durationSec: 132, pages: 4, events: 12, rageClicks: 0, startedMinutesAgo: 18, outcome: "Browsing", path: ["/", "/features", "/changelog"] },
  { id: "s_6a220", user: "Priya S.", anon: false, location: "Mumbai, IN", device: "Mobile", browser: "Chrome", durationSec: 226, pages: 5, events: 19, rageClicks: 2, startedMinutesAgo: 24, outcome: "Converted", path: ["/", "/pricing", "/signup"] },
  { id: "s_8e451", user: "Anonymous", anon: true, location: "São Paulo, BR", device: "Mobile", browser: "Safari", durationSec: 33, pages: 1, events: 3, rageClicks: 4, startedMinutesAgo: 33, outcome: "Bounced", path: ["/"] },
  { id: "s_2f8c3", user: "leo.m", anon: false, location: "Paris, FR", device: "Desktop", browser: "Chrome", durationSec: 178, pages: 5, events: 16, rageClicks: 0, startedMinutesAgo: 41, outcome: "Browsing", path: ["/", "/changelog", "/blog/launch"] },
  { id: "s_5b0d7", user: "Anonymous", anon: true, location: "Sydney, AU", device: "Tablet", browser: "Safari", durationSec: 96, pages: 3, events: 8, rageClicks: 1, startedMinutesAgo: 52, outcome: "Browsing", path: ["/", "/features", "/pricing"] },
  { id: "s_4c9e2", user: "hannah.dev", anon: false, location: "Amsterdam, NL", device: "Desktop", browser: "Arc", durationSec: 402, pages: 8, events: 34, rageClicks: 0, startedMinutesAgo: 68, outcome: "Converted", path: ["/", "/pricing", "/signup", "/app"] },
  { id: "s_0a63b", user: "Anonymous", anon: true, location: "Chicago, US", device: "Mobile", browser: "Chrome", durationSec: 58, pages: 2, events: 6, rageClicks: 2, startedMinutesAgo: 84, outcome: "Bounced", path: ["/", "/signup"] },
  { id: "s_9d17c", user: "kenji.t", anon: false, location: "Tokyo, JP", device: "Desktop", browser: "Chrome", durationSec: 311, pages: 7, events: 28, rageClicks: 0, startedMinutesAgo: 102, outcome: "Browsing", path: ["/", "/features", "/pricing", "/changelog"] },
  { id: "s_3e8a4", user: "Anonymous", anon: true, location: "Madrid, ES", device: "Mobile", browser: "Safari", durationSec: 147, pages: 4, events: 11, rageClicks: 5, startedMinutesAgo: 133, outcome: "Browsing", path: ["/", "/pricing", "/features"] },
];

// ---- funnel ---------------------------------------------------------------

export type FunnelStep = { label: string; users: number };

export const funnel = {
  name: "Signup → Activation",
  window: "7-day window",
  steps: [
    { label: "Viewed landing", users: 2140 },
    { label: "Viewed pricing", users: 1284 },
    { label: "Started signup", users: 742 },
    { label: "Completed signup", users: 521 },
    { label: "Created first habit", users: 388 },
  ] as FunnelStep[],
};

// ---- events ---------------------------------------------------------------

export type EventRow = {
  name: string;
  count: number;
  users: number;
  delta: number;
  spark: number[];
};

export const events: EventRow[] = [
  { name: "page_view", count: 8421, users: 1284, delta: 9.2, spark: series(301, 12, 200, 340) },
  { name: "signup_started", count: 742, users: 742, delta: 6.4, spark: series(302, 12, 18, 42) },
  { name: "signup_completed", count: 521, users: 521, delta: 11.8, spark: series(303, 12, 10, 30) },
  { name: "habit_created", count: 1663, users: 388, delta: 22.1, spark: series(304, 12, 30, 90) },
  { name: "reminder_set", count: 904, users: 341, delta: 15.0, spark: series(305, 12, 20, 60) },
  { name: "upgrade_clicked", count: 604, users: 512, delta: -4.2, spark: series(306, 12, 12, 40) },
  { name: "checkout_started", count: 288, users: 271, delta: 2.7, spark: series(307, 12, 6, 22) },
  { name: "subscribed", count: 96, users: 96, delta: 18.9, spark: series(308, 12, 2, 12) },
];

// ---- retention (weekly cohorts, % retained) -------------------------------

export const retention = {
  weeks: ["W0", "W1", "W2", "W3", "W4"],
  cohorts: [
    { label: "Jun 2", size: 214, values: [100, 62, 48, 41, 38] },
    { label: "Jun 9", size: 268, values: [100, 66, 51, 44, null] },
    { label: "Jun 16", size: 241, values: [100, 71, 55, null, null] },
    { label: "Jun 23", size: 312, values: [100, 68, null, null, null] },
    { label: "Jun 30", size: 289, values: [100, null, null, null, null] },
  ] as { label: string; size: number; values: (number | null)[] }[],
};
