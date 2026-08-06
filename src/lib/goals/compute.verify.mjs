// Verify the goal matcher for real:  node src/lib/goals/compute.verify.mjs
//
// compute.ts is pure and dependency-free, so this strips its type annotations
// with the TypeScript compiler already in node_modules and runs the result.
// No test runner, no config — the rules that decide what a business counts as
// a conversion are worth executing, not eyeballing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "compute.ts"), "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const mod = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const { matchesRule, matchingSessions, totalSessions, computeGoalCards, validateGoalInput } = mod;

let fails = 0;
const ok = (label, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) fails++;
  console.log(`  ${good ? "OK  " : "FAIL"} ${String(label).padEnd(52)} got=${JSON.stringify(got)}${good ? "" : " want=" + JSON.stringify(want)}`);
};

const pv = (path, sessionId) => ({ type: "pageview", path, sessionId });
const custom = (name, sessionId) => ({ type: "custom", name, path: "/", sessionId });

// ── path rules ─────────────────────────────────────────────────────────────
console.log("\nPATH rules — 'reached this page'");
const contains = { kind: "path", operator: "contains", value: "checkout" };
ok("contains matches mid-path",   matchesRule(contains, pv("/shop/checkout/step-2", "s1")), true);
ok("contains is case-insensitive", matchesRule(contains, pv("/Shop/Checkout", "s1")), true);
ok("contains misses unrelated",   matchesRule(contains, pv("/shop/cart", "s1")), false);

const starts = { kind: "path", operator: "starts_with", value: "/menu" };
ok("starts_with matches",         matchesRule(starts, pv("/menu/burrito", "s1")), true);
ok("starts_with is anchored",     matchesRule(starts, pv("/es/menu/burrito", "s1")), false);

const exact = { kind: "path", operator: "exact", value: "/thank-you" };
ok("exact matches",               matchesRule(exact, pv("/thank-you", "s1")), true);
ok("exact rejects a sub-path",    matchesRule(exact, pv("/thank-you/print", "s1")), false);
// A trailing slash is not a different page — the commonest way an exact goal
// silently reads zero forever.
ok("exact tolerates trailing /",  matchesRule(exact, pv("/thank-you/", "s1")), true);
ok("exact tolerates rule slash",  matchesRule({ ...exact, value: "/thank-you/" }, pv("/thank-you", "s1")), true);
ok("root path survives folding",  matchesRule({ kind: "path", operator: "exact", value: "/" }, pv("/", "s1")), true);

console.log("\nPATH rules — only a PAGEVIEW counts as 'reached'");
// A click or scroll carries a path too. Counting those would credit a session
// for a page it merely clicked a link on.
ok("click on the path does not count",  matchesRule(contains, { type: "click", path: "/checkout", sessionId: "s1" }), false);
ok("scroll on the path does not count", matchesRule(contains, { type: "scroll", path: "/checkout", sessionId: "s1" }), false);

// ── event rules ────────────────────────────────────────────────────────────
console.log("\nEVENT rules — exact name, never partial");
const evRule = { kind: "event", operator: "exact", value: "purchase" };
ok("custom event matches",        matchesRule(evRule, custom("purchase", "s1")), true);
ok("case-insensitive",            matchesRule(evRule, custom("Purchase", "s1")), true);
// The reason events ignore the operator: a partial match would fold a FAILED
// signup into the success card and quietly overstate every conversion.
ok("no partial match",            matchesRule(evRule, custom("purchase_failed", "s1")), false);
ok("operator cannot loosen it",   matchesRule({ ...evRule, operator: "contains" }, custom("purchase_failed", "s1")), false);
ok("a pageview is not an event",  matchesRule(evRule, pv("/purchase", "s1")), false);

console.log("\nrules that must match NOTHING");
ok("empty value never matches",   matchesRule({ kind: "path", operator: "contains", value: "" }, pv("/anything", "s1")), false);
ok("whitespace value neither",    matchesRule({ kind: "path", operator: "contains", value: "   " }, pv("/anything", "s1")), false);
ok("empty event value neither",   matchesRule({ kind: "event", operator: "exact", value: "" }, custom("purchase", "s1")), false);

// ── counting ───────────────────────────────────────────────────────────────
console.log("\nCOUNTING — sessions, not events");
const EVENTS = [
  pv("/", "s1"), pv("/menu", "s1"), pv("/menu/burrito", "s1"), pv("/menu/burrito", "s1"), // revisits
  pv("/", "s2"), pv("/menu/taco", "s2"),
  pv("/", "s3"), pv("/menu/burrito", "s3"), custom("purchase", "s3"),
  pv("/", "s4"),
];
const burrito = { kind: "path", operator: "contains", value: "burrito" };
ok("4 sessions in the window",        totalSessions(EVENTS), 4);
ok("2 sessions reached burrito",      matchingSessions(EVENTS, burrito).size, 2);
ok("a revisit is not a second hit",   [...matchingSessions(EVENTS, burrito)].sort().join(), "s1,s3");
ok("1 session purchased",             matchingSessions(EVENTS, { kind: "event", operator: "exact", value: "purchase" }).size, 1);
ok("no events -> no sessions",        totalSessions([]), 0);
ok("events without a session id",     totalSessions([{ type: "pageview", path: "/", sessionId: "" }]), 0);

console.log("\nCARDS — what the overview renders");
const GOALS = [
  { id: "g1", name: "Burrito", kind: "path", operator: "contains", value: "burrito", position: 1 },
  { id: "g2", name: "Purchase", kind: "event", operator: "exact", value: "purchase", position: 0 },
  { id: "g3", name: "Paused", kind: "path", operator: "contains", value: "menu", position: 2, active: false },
];
const cards = computeGoalCards(EVENTS, GOALS);
ok("ordered by position",             cards.map((c) => c.name).join(), "Purchase,Burrito");
// A paused card showing "0" is indistinguishable from a broken one, so it is
// omitted entirely rather than rendered empty.
ok("inactive goal is omitted",        cards.some((c) => c.name === "Paused"), false);
ok("burrito: 2 sessions",             cards.find((c) => c.name === "Burrito").sessions, 2);
ok("burrito: rate is 2/4",            cards.find((c) => c.name === "Burrito").rate, 0.5);
ok("denominator is all sessions",     cards[0].totalSessions, 4);
ok("empty window -> rate 0, not NaN", computeGoalCards([], GOALS)[0].rate, 0);
ok("empty window -> 0 sessions",      computeGoalCards([], GOALS)[0].sessions, 0);
ok("no goals -> no cards",            computeGoalCards(EVENTS, []), []);
ok("null goals -> no cards",          computeGoalCards(EVENTS, null), []);

// ── validation ─────────────────────────────────────────────────────────────
console.log("\nVALIDATION — what the API will store");
ok("a good path goal",   validateGoalInput({ name: "Burrito", kind: "path", operator: "contains", value: "/menu/burrito" }).ok, true);
ok("defaults to path+contains", validateGoalInput({ name: "X", value: "/y" }).value, { name: "X", kind: "path", operator: "contains", value: "/y" });
// An event rule must never carry a loose operator into storage.
ok("event operator is pinned to exact", validateGoalInput({ name: "Buy", kind: "event", operator: "contains", value: "purchase" }).value.operator, "exact");
ok("name is required",   validateGoalInput({ value: "/x" }).error, "name is required");
ok("blank name rejected", validateGoalInput({ name: "   ", value: "/x" }).error, "name is required");
ok("value is required",  validateGoalInput({ name: "X" }).error, "path is required");
ok("event value message", validateGoalInput({ name: "X", kind: "event" }).error, "event name is required");
ok("bad kind rejected",  validateGoalInput({ name: "X", kind: "regex", value: "/x" }).error, "kind must be 'path' or 'event'");
ok("bad operator rejected", validateGoalInput({ name: "X", operator: "matches", value: "/x" }).error, "operator must be 'contains', 'starts_with' or 'exact'");
ok("name is trimmed",    validateGoalInput({ name: "  Burrito  ", value: "/x" }).value.name, "Burrito");
ok("over-long name",     validateGoalInput({ name: "x".repeat(61), value: "/y" }).ok, false);

console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nAll assertions passed.\n");
process.exit(fails ? 1 : 0);
