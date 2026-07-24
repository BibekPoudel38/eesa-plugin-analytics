import "server-only";
import { allEvents, hydrateEvents } from "@/lib/live/store";
import * as agg from "@/lib/live/aggregate";

const DAY = 86_400_000;

export type Viz =
  | { kind: "metric"; label: string; value: string; delta?: number; goodUp?: boolean }
  | {
      kind: "compare";
      label: string;
      a: { label: string; value: number };
      b: { label: string; value: number };
      delta: number;
      goodUp?: boolean;
    }
  | { kind: "bars"; title: string; items: { label: string; value: number; color?: string }[] };

export type AssistantAnswer = { text: string; viz?: Viz };

function pct(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}
const dirWord = (a: number, b: number) => (a > b ? "up" : a < b ? "down" : "flat");

/**
 * PLACEHOLDER natural-language analyst — keyword intent matching over the live
 * store, returning real numbers + a visualization spec. To go live, replace the
 * intent block with a Claude call using tool-use: expose typed tools (getOrders,
 * getVisitors, getTopPages, …) that run these same computations, let
 * claude-opus-4-8 pick and fill them from the question, and format the reply.
 * The return shape (AssistantAnswer) stays identical, so the API route + UI are
 * unchanged.
 */
export async function answerQuestion(raw: string): Promise<AssistantAnswer> {
  await hydrateEvents();
  const events = allEvents();
  const now = Date.now();
  const t0 = now - DAY; // start of "today" (rolling 24h)
  const y0 = now - 2 * DAY; // start of "yesterday"
  const q = raw.toLowerCase();

  const win = (a: number, b: number) =>
    events.filter((e) => {
      const t = e.recvTs || e.ts;
      return t >= a && t < b;
    });
  const sessionsWith = (needle: string, a: number, b: number) => {
    const s = new Set<string>();
    for (const e of events) {
      const t = e.recvTs || e.ts;
      if (e.type === "pageview" && e.path.includes(needle) && t >= a && t < b) s.add(e.sessionId);
    }
    return s.size;
  };
  const ordersIn = (a: number, b: number) => sessionsWith("confirmation.html", a, b);
  const cartIn = (a: number, b: number) => sessionsWith("cart.html", a, b);
  const mealPassIn = (a: number, b: number) => sessionsWith("meal-pass.html", a, b);
  const visitorsIn = (a: number, b: number) => new Set(win(a, b).map((e) => e.visitorId)).size;
  const rageIn = (a: number, b: number) => win(a, b).filter((e) => e.type === "rageclick").length;

  // Orders (today vs yesterday)
  if (/\b(order|orders|purchase|sale|sold|bought|buy|checkout)\b/.test(q)) {
    const today = ordersIn(t0, now);
    const yest = ordersIn(y0, t0);
    const d = pct(today, yest);
    const dir = dirWord(today, yest);
    return {
      text: `Today you had ${today} completed order${today === 1 ? "" : "s"}, versus ${yest} yesterday — ${
        dir === "flat" ? "about the same" : `${Math.abs(Math.round(d))}% ${dir}`
      }.`,
      viz: {
        kind: "compare",
        label: "Completed orders",
        a: { label: "Today", value: today },
        b: { label: "Yesterday", value: yest },
        delta: d,
        goodUp: true,
      },
    };
  }

  // Visitors (but let source/channel questions fall through to the sources intent)
  const isSourceQ = /\b(source|sources|referr|channel|acquisition)\b/.test(q) || /(coming|come)\s+from/.test(q);
  if (!isSourceQ && /\b(visitor|visitors|user|users|people|traffic|audience)\b/.test(q)) {
    const today = visitorsIn(t0, now);
    const yest = visitorsIn(y0, t0);
    const d = pct(today, yest);
    return {
      text: `${today} visitor${today === 1 ? "" : "s"} in the last 24h${
        yest ? `, ${Math.abs(Math.round(d))}% ${today >= yest ? "up" : "down"} from the day before` : ""
      }.`,
      viz: {
        kind: "compare",
        label: "Visitors",
        a: { label: "Today", value: today },
        b: { label: "Yesterday", value: yest },
        delta: d,
        goodUp: true,
      },
    };
  }

  // Meal pass
  if (/\bmeal\s?pass\b/.test(q)) {
    const c = mealPassIn(t0, now);
    return {
      text: `${c} visitor${c === 1 ? "" : "s"} engaged the Meal Pass page in the last 24h.`,
      viz: { kind: "metric", label: "Meal Pass interest (24h)", value: String(c) },
    };
  }

  // Cart / abandonment
  if (/\b(cart|basket|abandon)\b/.test(q)) {
    const c = cartIn(t0, now);
    const orders = ordersIn(t0, now);
    return {
      text: `${c} visitor${c === 1 ? "" : "s"} reached the cart in the last 24h, and ${orders} completed a purchase${
        c ? ` (${Math.round((orders / c) * 100)}% of carts converted)` : ""
      }.`,
      viz: {
        kind: "compare",
        label: "Cart → order",
        a: { label: "Reached cart", value: c },
        b: { label: "Completed", value: orders },
        delta: c ? pct(orders, c) : 0,
        goodUp: true,
      },
    };
  }

  // Rage clicks / friction
  if (/\b(rage|friction|frustrat|angry|stuck)\b/.test(q)) {
    const r = rageIn(t0, now);
    const ry = rageIn(y0, t0);
    const d = pct(r, ry);
    return {
      text: `${r} rage-click${r === 1 ? "" : "s"} in the last 24h${
        ry ? `, ${Math.abs(Math.round(d))}% ${r >= ry ? "up" : "down"} vs yesterday` : ""
      }.`,
      viz: {
        kind: "compare",
        label: "Rage clicks",
        a: { label: "Today", value: r },
        b: { label: "Yesterday", value: ry },
        delta: d,
        goodUp: false,
      },
    };
  }

  // Top pages
  if (/\b(top page|popular|most visited|pages|landing)\b/.test(q)) {
    const pages = agg.liveTopPages(win(now - 7 * DAY, now)).slice(0, 5);
    if (!pages.length) return { text: "No page views captured yet." };
    return {
      text: `Your most-visited pages this week: ${pages.slice(0, 3).map((p) => p.path).join(", ")}.`,
      viz: {
        kind: "bars",
        title: "Top pages · last 7 days",
        items: pages.map((p) => ({ label: p.path, value: p.views, color: "var(--teal)" })),
      },
    };
  }

  // Traffic sources
  if (/\b(source|sources|referr|channel|acquisition)\b/.test(q) || /where.*(from|come)/.test(q)) {
    const src = agg.liveSources(win(now - 7 * DAY, now));
    if (!src.length) return { text: "No traffic sources captured yet." };
    return {
      text: `Traffic is mostly ${src[0]?.name ?? "Direct"} this week.`,
      viz: {
        kind: "bars",
        title: "Traffic sources · last 7 days",
        items: src.map((s) => ({ label: s.name, value: s.value, color: s.color })),
      },
    };
  }

  // Conversion rate
  if (/\b(conversion|convert|rate)\b/.test(q)) {
    const sessions = new Set(win(t0, now).map((e) => e.sessionId)).size;
    const orders = ordersIn(t0, now);
    const rate = sessions ? (orders / sessions) * 100 : 0;
    return {
      text: `Conversion in the last 24h is ${rate.toFixed(1)}% — ${orders} order${
        orders === 1 ? "" : "s"
      } from ${sessions} session${sessions === 1 ? "" : "s"}.`,
      viz: { kind: "metric", label: "Conversion · 24h", value: `${rate.toFixed(1)}%` },
    };
  }

  return {
    text: "I can answer questions about orders, visitors, cart, traffic sources, top pages, rage clicks, and conversion. Try “How were orders today vs yesterday?” or “Top pages this week.”",
  };
}
