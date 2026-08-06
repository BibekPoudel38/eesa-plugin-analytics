// Verify funnels + retention for real:  node src/lib/funnels/compute.verify.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const goals = readFileSync(join(here, "..", "goals", "compute.ts"), "utf8");
let funnels = readFileSync(join(here, "compute.ts"), "utf8");
// Inline the goals module instead of resolving the "@/..." alias.
funnels = funnels.replace(
  /import \{[^}]*\} from "@\/lib\/goals\/compute";\n/,
  goals + "\n",
);
const js = ts.transpileModule(funnels, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const { computeFunnel, computeRetention, weekStart } = mod;

let fails = 0;
const ok = (label, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) fails++;
  console.log(`  ${good ? "OK  " : "FAIL"} ${String(label).padEnd(54)} got=${JSON.stringify(got)}${good ? "" : " want=" + JSON.stringify(want)}`);
};

const pv = (path, sessionId) => ({ type: "pageview", path, sessionId });
const custom = (name, sessionId) => ({ type: "custom", name, path: "/", sessionId });

// s1 goes all the way; s2 stops at cart; s3 only lands; s4 lands + purchases
// WITHOUT passing cart (tests that steps are monotonic, not independent).
const EVENTS = [
  pv("/", "s1"), pv("/cart", "s1"), pv("/checkout", "s1"), custom("purchase", "s1"),
  pv("/", "s2"), pv("/cart", "s2"),
  pv("/", "s3"),
  pv("/", "s4"), custom("purchase", "s4"),
];
const STEPS = [
  { label: "Landed", kind: "path", operator: "exact", value: "/" },
  { label: "Cart", kind: "path", operator: "contains", value: "cart" },
  { label: "Checkout", kind: "path", operator: "contains", value: "checkout" },
  { label: "Purchased", kind: "event", operator: "exact", value: "purchase" },
];

console.log("\nFUNNEL — monotonic, per session");
const f = computeFunnel(EVENTS, STEPS);
ok("4 sessions in the window", f.total, 4);
ok("step counts narrow", f.steps.map((s) => s.users), [4, 2, 1, 1]);
ok("labels preserved", f.steps.map((s) => s.label).join(","), "Landed,Cart,Checkout,Purchased");
// s4 purchased but never reached cart — a funnel must NOT count it at the end,
// or the last step can exceed the one before it and the chart goes backwards.
ok("s4 purchased but skipped cart -> excluded", f.steps[3].users, 1);
ok("overall = last/first", f.overall, 0.25);
ok("steps never increase", f.steps.every((s, i) => i === 0 || s.users <= f.steps[i - 1].users), true);

console.log("\nFUNNEL — degenerate inputs");
ok("no steps -> no rows", computeFunnel(EVENTS, []).steps, []);
ok("no steps -> overall 0", computeFunnel(EVENTS, []).overall, 0);
ok("no events -> zeros", computeFunnel([], STEPS).steps.map((s) => s.users), [0, 0, 0, 0]);
ok("no events -> overall 0, not NaN", computeFunnel([], STEPS).overall, 0);
ok("null events safe", computeFunnel(null, STEPS).total, 0);
ok("null steps safe", computeFunnel(EVENTS, null).steps, []);
// A step nothing matches zeroes the rest — that is correct, not a bug.
ok("unmatched first step zeroes all",
   computeFunnel(EVENTS, [{ label: "X", kind: "path", operator: "exact", value: "/nope" }, STEPS[1]]).steps.map((s) => s.users),
   [0, 0]);

console.log("\nRETENTION — week bucketing (UTC Monday)");
const MON = Date.UTC(2026, 0, 5);            // Mon 5 Jan 2026
ok("Monday is its own week start", weekStart(MON), MON);
ok("Wednesday folds back", weekStart(Date.UTC(2026, 0, 7)), MON);
// The classic off-by-one: getUTCDay() is 0 on Sunday, so Sunday must walk BACK
// six days, not forward one.
ok("Sunday belongs to the week that started", weekStart(Date.UTC(2026, 0, 11)), MON);
ok("next Monday is a new week", weekStart(Date.UTC(2026, 0, 12)), Date.UTC(2026, 0, 12));

console.log("\nRETENTION — cohorts");
const W = 7 * 86400000;
const R = [
  // cohort A: 2 visitors first seen week 0; one returns in w1 and w2
  { visitorId: "a1", ts: MON }, { visitorId: "a1", ts: MON + W }, { visitorId: "a1", ts: MON + 2 * W },
  { visitorId: "a2", ts: MON },
  // cohort B: 1 visitor first seen week 1, returns week 2
  { visitorId: "b1", ts: MON + W }, { visitorId: "b1", ts: MON + 2 * W },
];
const now = MON + 2 * W + 86400000; // during week 2
const ret = computeRetention(R, now);
ok("two cohorts", ret.cohorts.length, 2);
ok("W0..W4 columns", ret.weeks, ["W0", "W1", "W2", "W3", "W4"]);
ok("cohort A size", ret.cohorts[0].size, 2);
ok("cohort A: W0 is always 100", ret.cohorts[0].values[0], 100);
ok("cohort A: 1 of 2 back in W1", ret.cohorts[0].values[1], 50);
ok("cohort A: 1 of 2 back in W2", ret.cohorts[0].values[2], 50);
// The distinction the whole grid rests on: a week that has not happened is
// null, never 0 — 0 would read as total churn.
ok("cohort A: future weeks are null", ret.cohorts[0].values.slice(3), [null, null]);
ok("cohort B starts a week later", ret.cohorts[1].size, 1);
ok("cohort B: W1 is its own week 2", ret.cohorts[1].values[1], 100);
ok("cohort B: future is null", ret.cohorts[1].values.slice(2), [null, null, null]);

console.log("\nRETENTION — degenerate inputs");
ok("no events -> no cohorts", computeRetention([], now).cohorts, []);
ok("no events still has columns", computeRetention([], now).weeks.length, 5);
ok("null safe", computeRetention(null, now).cohorts, []);
ok("rows without a visitor are ignored", computeRetention([{ visitorId: "", ts: MON }], now).cohorts, []);
ok("rows with a bad ts are ignored", computeRetention([{ visitorId: "v", ts: NaN }], now).cohorts, []);
// Only the most recent N cohorts are kept, so an old site doesn't render 200 rows.
const many = [];
for (let i = 0; i < 9; i++) many.push({ visitorId: `v${i}`, ts: MON + i * W });
ok("at most 5 cohorts", computeRetention(many, MON + 9 * W).cohorts.length, 5);

console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nAll assertions passed.\n");
process.exit(fails ? 1 : 0);
