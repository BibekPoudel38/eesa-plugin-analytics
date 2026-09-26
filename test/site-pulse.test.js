// Is anybody reaching the site right now?
//
// WHY THIS EXISTS
// Eesa watches chups.com from its own server every minute, and that can only
// see whether the server answers. The visitors are the other witness: when
// they stop arriving at an hour they never stop, something between them and
// the site is broken — a script, a DNS change, a page that loads for a robot
// and not for a person. site_pulse gives Eesa the facts to judge that by.
//
// THE TRAPS THIS GUARDS
// - Every other tool loads the window's events into this process first. A
//   pulse asked every few minutes must never do that: it is answered in SQL.
// - "Usually quiet for" is a MEDIAN of each day's longest spell. A maximum
//   would let one past outage teach the watch that two silent hours at
//   lunchtime are ordinary, and it would stay taught for two weeks.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test, before } = require("node:test");

const mcp = fs.readFileSync("src/app/mcp/route.ts", "utf8");
const sql = fs.readFileSync("src/lib/db/pulse.ts", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

let pulse;
before(async () => {
  pulse = await import("../src/lib/live/pulse.ts");
});

const SITE = { name: "Chups", domain: "chups.com", timezone: "America/Los_Angeles" };
const NOW = Date.UTC(2026, 8, 26, 19, 0, 0);

test("the facts come back as numbers, with the silence measured from now", () => {
  const p = pulse.shapePulse(
    { last_ms: String(NOW - 14_000), last_hour: 183, usual_s: 280, days: 14 },
    SITE, NOW,
  );
  assert.deepStrictEqual(p, {
    site: "Chups", domain: "chups.com", timezone: "America/Los_Angeles",
    checkedAt: NOW, lastEventAt: NOW - 14_000, quietSec: 14,
    lastHour: 183, usualQuietSec: 280, days: 14,
  });
});

test("a site nobody has visited in 14 days says so, rather than a silence of zero", () => {
  const p = pulse.shapePulse({ last_ms: null, last_hour: 0, usual_s: null, days: 0 }, SITE, NOW);
  assert.strictEqual(p.lastEventAt, null);
  assert.strictEqual(p.quietSec, null);
  assert.strictEqual(p.usualQuietSec, null);
  assert.strictEqual(p.days, 0);
});

test("an event stamped a moment ahead of this clock is just now, not a negative silence", () => {
  const p = pulse.shapePulse({ last_ms: NOW + 900, last_hour: 1, usual_s: 60, days: 3 }, SITE, NOW);
  assert.strictEqual(p.quietSec, 0);
});

test("no row at all reads as no visitors, not a crash", () => {
  const p = pulse.shapePulse(undefined, { name: "X", domain: "x.com" }, NOW);
  assert.strictEqual(p.timezone, "UTC");
  assert.strictEqual(p.lastHour, 0);
  assert.strictEqual(p.quietSec, null);
});

test("site_pulse is answered before any events are loaded into the process", () => {
  const branch = mcp.indexOf('if (name === "site_pulse")');
  const load = mcp.indexOf("await loadEvents(");
  assert.ok(branch > 0, "site_pulse has its own branch");
  assert.ok(load > 0, "the other tools still load events");
  assert.ok(branch < load, "site_pulse returns before loadEvents runs");
});

test("usual quiet is a median of daily longest spells, and the open spell is never part of it", () => {
  assert.match(sql, /percentile_cont\(0\.5\)/);
  assert.doesNotMatch(sql, /max\(gap\)/, "a maximum would learn from past outages");
  assert.match(sql, /ev\.prev is not null/);
  assert.match(sql, /interval '14 days'/);
});

test("the tool is listed where the agent and the registry find it", () => {
  assert.match(mcp, /name: "site_pulse"/);
  assert.ok(manifest.surfaces.mcp.tools.some((t) => t.name === "site_pulse"));
});
