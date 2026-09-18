// Where replays live, how long they live, and what the screen says when one
// has gone.
//
// WHY THIS EXISTS
// Replays used to be kept in Redis, capped at the 60 most recent sessions per
// site. A count is not a duration and the two were not close: visits live in
// Postgres for 90 days, so the sessions list went back weeks while the replays
// behind it went back hours. Practically every session anybody opened said "no
// recording" — and the message blamed "demo sessions and very short visits",
// naming the two cases that almost never happen and missing the one that
// always did. A 15-page, 1m37s visit from four days ago read as a broken
// player. Nothing was broken; the screen was describing a different system
// than the one it was running on, and the store had thrown the recording away.
//
// Redis was also the wrong promise for this data. It is a cache: an eviction,
// a restart or a missing credential loses everything, and the fallback when
// the credential was missing was an in-process Map that died on every deploy.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test } = require("node:test");

const player = fs.readFileSync("src/components/sessions/replay-player.tsx", "utf8");
const store = fs.readFileSync("src/lib/live/recordings.ts", "utf8");
const limits = fs.readFileSync("src/lib/live/recording-limits.ts", "utf8");
const schema = fs.readFileSync("db/schema.sql", "utf8");

const RETENTION_DAYS = Number(
  /export const RETENTION_DAYS\s*=\s*(\d+)/.exec(limits)?.[1],
);

const empty = player.slice(
  player.indexOf("No recording for this session"),
  player.indexOf('{status === "error"'),
);

// ---- durability -----------------------------------------------------------

test("replays are stored in Postgres, not in a cache", () => {
  assert.ok(/from "\.\.\/db\/pool"/.test(store),
    "the store should write through the shared Postgres pool");
  assert.ok(!/redisClient|@upstash/.test(store),
    "Redis is a cache: an eviction, a restart or a missing credential loses "
    + "every replay, which is the wrong promise for a year of retention");
});

test("there is no in-memory fallback that dies with the process", () => {
  // The old code fell back to a Map when Redis credentials were absent. It
  // worked in dev, looked fine in production, and lost everything on each
  // deploy — the worst kind of failure, because nothing reports it.
  assert.ok(!/new Map\(\)/.test(store),
    "an in-process fallback silently loses recordings on every restart");
});

test("nothing caps the NUMBER of sessions kept", () => {
  // The whole defect. Any per-site count cap re-creates it: the list is bound
  // by time and the replays by volume, so busy sites lose them within hours
  // and nobody can tell you how long a replay lasts.
  assert.ok(!/MAX_RECORDINGS/.test(store + limits),
    "retention must be a duration, not a count — a count's meaning changes "
    + "with traffic, so nobody can say how long a replay is kept");
});

test("retention is a whole year with room to spare", () => {
  assert.ok(RETENTION_DAYS >= 366,
    `replays must survive a full year; RETENTION_DAYS is ${RETENTION_DAYS}`);
});

test("the schema keeps the events for exactly as long as the code claims", () => {
  // The database drops the data and this constant decides what the UI offers
  // and says. A disagreement shows up as a Watch button that plays nothing.
  const policy = /add_retention_policy\('recording_chunks',\s*interval '(\d+) days'\)/
    .exec(schema);
  assert.ok(policy, "recording_chunks needs a retention policy");
  assert.strictEqual(Number(policy[1]), RETENTION_DAYS,
    "db/schema.sql and recording-limits.ts must agree on the window");
});

test("retention drops hypertable chunks instead of deleting rows", () => {
  // A year of replays deleted row by row bloats the table and then needs a
  // VACUUM FULL — an exclusive lock on the biggest table the plugin has — to
  // give the space back.
  assert.ok(/create_hypertable\('recording_chunks'/.test(schema),
    "recording_chunks should be a hypertable so retention is a chunk drop");
});

test("the events are compressed on the way in", () => {
  assert.ok(/bytea/.test(schema.slice(schema.indexOf("create table if not exists recording_chunks"),
    schema.indexOf("create table if not exists recording_chunks") + 900)),
    "replay events should be stored as compressed bytes");
  assert.ok(/packChunk/.test(store) && /unpackChunk/.test(store),
    "the store should go through the codec rather than compressing inline");
});

// ---- the per-session guard ------------------------------------------------

test("one runaway page still cannot write an unbounded recording", () => {
  // Durability is not permission for a single tab with an animation loop to
  // fill the disk. This cap is about one session, not about storage policy.
  assert.ok(/MAX_EVENTS_PER/.test(store) && /MAX_EVENTS_PER/.test(limits),
    "a per-session event ceiling must survive the move off Redis");
  assert.ok(/for update/i.test(store),
    "the cap check and the write must share a lock — the recorder flushes on a "
    + "timer AND on each DOM snapshot, so two POSTs for one session are "
    + "routinely in flight and both would pass an unlocked check");
});

test("an expired replay reads as absent, not as an empty one", () => {
  // The summary row outlives its chunks: retention drops whole hypertable
  // chunks and the summary is a few hundred bytes worth keeping. Returning a
  // recording with no events would show the player a blank frame instead of
  // the explanation.
  assert.ok(/if \(!rows\.length\) return null/.test(store),
    "a session whose chunks have aged out must resolve to null");
  assert.ok(/started_at >= now\(\) - /.test(store),
    "the Watch affordance must be bounded by the retention window, or it "
    + "promises something the store has already dropped");
});

// ---- what the screen says -------------------------------------------------

test("the cap is defined once and shared", () => {
  assert.ok(/export const RETENTION_DAYS\s*=\s*\d+/.test(limits),
    "the window should live in recording-limits.ts");
  assert.ok(/from "\.\/recording-limits"/.test(store), "the store should import it");
});

test("the limits module is importable from a client component", () => {
  // recordings.ts is `server-only`; importing it into the player would fail the
  // build. That constraint is the whole reason this module exists, so if
  // somebody adds the marker here the player silently loses its explanation.
  assert.ok(!/^\s*import\s+"server-only"/m.test(limits),
    'recording-limits.ts must not be "server-only" — the player is a client '
    + "component and imports it");
});

test("the empty state quotes the real window from the real constant", () => {
  assert.ok(/RETENTION_DAYS/.test(empty),
    "the message should state the window from the shared constant, so it "
    + "cannot disagree with what the database enforces");
});

test("it no longer blames demo data", () => {
  assert.ok(!/[Dd]emo sessions/.test(empty),
    "there is no demo data on a live site; naming it sends people looking for "
    + "a cause that does not exist");
});

test("the player still reaches the empty state on a 404", () => {
  // The wording is only useful if this is still how a missing recording
  // arrives. Both are silent failures that render as the same screen.
  assert.ok(/res\.status === 404[\s\S]{0,80}setStatus\("empty"\)/.test(player),
    "a 404 from /api/rec/[id] should show the empty state");
  assert.ok(/events\.length < 2[\s\S]{0,40}setStatus\("empty"\)/.test(player),
    "a single-event recording is a still frame, not a replay");
});
