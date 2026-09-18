// What the player says when there is no replay.
//
// WHY THIS EXISTS
// Visits are kept in Postgres for 90 days. Replays are kept in Redis for the
// most recent MAX_RECORDINGS visits — a count, not a duration. On a site with
// any real traffic those two windows differ by weeks, so the sessions list is
// full of visits whose replay expired long ago.
//
// The player told those people "Demo sessions and very short visits don't have
// one." That was true of the two cases it named and wrong about the one that
// actually happens, so a 15-page, 1m37s session from four days ago read as a
// broken player rather than as expired storage. Nothing was broken; the screen
// was simply describing a different system than the one it was running on.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test } = require("node:test");

const player = fs.readFileSync("src/components/sessions/replay-player.tsx", "utf8");
const store = fs.readFileSync("src/lib/live/recordings.ts", "utf8");
const limits = fs.readFileSync("src/lib/live/recording-limits.ts", "utf8");

const empty = player.slice(
  player.indexOf("No recording for this session"),
  player.indexOf('{status === "error"'),
);

test("the cap is defined once and shared", () => {
  assert.ok(/export const MAX_RECORDINGS\s*=\s*\d+/.test(limits),
    "the cap should live in recording-limits.ts");
  assert.ok(!/^const MAX_RECORDINGS\s*=/m.test(store),
    "recordings.ts must import the cap, not redeclare it — a second copy is a "
    + "number that can drift away from the behaviour it describes");
  assert.ok(/from "\.\/recording-limits"/.test(store), "store should import it");
});

test("the limits module is importable from a client component", () => {
  // recordings.ts is `server-only`; importing it into the player would fail the
  // build. That constraint is the whole reason this module exists, so if
  // somebody adds the marker here the player silently loses its explanation.
  assert.ok(!/^\s*import\s+"server-only"/m.test(limits),
    'recording-limits.ts must not be "server-only" — the player is a client '
    + "component and imports it");
});

test("the empty state names the real reason, not just the rare ones", () => {
  assert.ok(/MAX_RECORDINGS/.test(empty),
    "the message should state how many visits keep a replay, from the shared "
    + "constant, so it cannot disagree with the store");
  assert.ok(/90 days/.test(empty),
    "it should contrast the 90-day visit retention, because the mismatch "
    + "between the two windows is what makes this look like a bug");
});

test("it no longer blames demo data", () => {
  assert.ok(!/[Dd]emo sessions/.test(empty),
    "there is no demo data on a live site; naming it sends people looking for "
    + "a cause that does not exist");
});

test("the player still reaches the empty state on a 404", () => {
  // The wording is only useful if this path is still how a missing recording
  // arrives. Both are silent failures that render as the same screen.
  assert.ok(/res\.status === 404[\s\S]{0,80}setStatus\("empty"\)/.test(player),
    "a 404 from /api/rec/[id] should show the empty state");
  assert.ok(/events\.length < 2[\s\S]{0,40}setStatus\("empty"\)/.test(player),
    "a single-event recording is a still frame, not a replay");
});
