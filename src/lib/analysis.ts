import type { SessionRow } from "@/lib/mock/data";

export type SessionAnalysis = {
  headline: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  friction: string[];
  recommendation: string;
};

/**
 * PLACEHOLDER "AI" analysis — a deterministic heuristic over the session so the
 * demo shows relevant, session-specific insight without calling an LLM yet.
 *
 * To go live: replace the body of this function with a Claude call
 * (`claude-haiku-4-5` is plenty for this; `claude-opus-4-8` for the richest
 * output) via `@anthropic-ai/sdk`, prompting with the session's event journey
 * and asking for this exact JSON shape. Keep the return type identical and the
 * rest of the app (route + panel) needs no changes. Cache results in Redis by
 * session id so each analysis is billed once.
 */
export function analyzeSession(s: SessionRow): SessionAnalysis {
  const path = s.path ?? [];
  const last = path[path.length - 1] ?? "/";
  const first = path[0] ?? last;
  const dur = s.durationSec;

  const friction: string[] = [];
  if (s.rageClicks > 0)
    friction.push(
      `${s.rageClicks} rage-click${s.rageClicks > 1 ? "s" : ""} on ${last} — an element looked interactive but didn't respond`,
    );
  if (dur < 15) friction.push(`Left after just ${dur}s — barely any time to engage`);
  if (path.length <= 1) friction.push("Viewed only one page — never went deeper");
  if (s.device === "Mobile")
    friction.push("On mobile — worth checking tap targets and layout on small screens");

  let headline: string;
  let confidence: SessionAnalysis["confidence"];
  let summary: string;
  let recommendation: string;

  if (s.completed) {
    headline = "Completed the purchase";
    confidence = "high";
    summary = `${s.user} moved cleanly from ${first} through to a confirmation page in ${dur}s across ${path.length} page${path.length > 1 ? "s" : ""}, with no signs of friction.`;
    recommendation =
      "This is a healthy path — use it as the baseline to compare abandoned sessions against.";
  } else if (s.inCart) {
    headline = "Abandoned before paying";
    confidence = s.rageClicks > 0 ? "high" : "medium";
    summary = `${s.user} reached the cart but left on ${last} without completing. ${
      s.rageClicks > 0
        ? "Rage-clicks right before the exit point to a specific blocker."
        : "The exit was quiet — likely hesitation over price, shipping, or a form field."
    }`;
    recommendation =
      s.rageClicks > 0
        ? `Inspect the element they rage-clicked on ${last} (coupon field, pay button, or a disabled control) on ${s.device} / ${s.browser}.`
        : "Surface the total cost earlier and keep a persistent cart summary so users aren't surprised at checkout.";
  } else if (s.rageClicks > 0) {
    headline = "Hit friction and gave up";
    confidence = "high";
    summary = `${s.user} showed frustration (${s.rageClicks} rage-click${s.rageClicks > 1 ? "s" : ""}) on ${last} before leaving. Something on that page isn't behaving as expected.`;
    recommendation = `Reproduce the ${last} interaction on ${s.device} / ${s.browser} and confirm the clicked element is actually responsive.`;
  } else if (s.outcome === "Bounced" || (path.length <= 1 && dur < 15)) {
    headline = "Bounced almost immediately";
    confidence = "medium";
    summary = `${s.user} landed on ${first} and left within ${dur}s without exploring. The entry page may not have matched intent, or loaded slowly.`;
    recommendation = `Check that ${first} loads fast and its headline matches what a ${s.source ?? "direct"} visitor expects.`;
  } else {
    headline = "Browsed but didn't convert";
    confidence = "low";
    summary = `${s.user} explored ${path.length} page${path.length > 1 ? "s" : ""} over ${dur}s but never reached the cart or checkout — interest without a clear next step.`;
    recommendation =
      "Add a clearer primary call-to-action on the pages they viewed to pull browsing visitors toward the cart.";
  }

  if (friction.length === 0)
    friction.push("No friction signals detected — this session flowed smoothly.");

  return { headline, confidence, summary, friction, recommendation };
}
