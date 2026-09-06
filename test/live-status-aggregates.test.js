// The status strip must ask the database for its numbers.
//
// It needs three integers and eight rows. It used to get them by loading every
// event in the window — measured on production at 135,102 rows / ~50 MB / ~1.2 s
// — and then counting in JavaScript. Nothing looked wrong: the numbers were
// right, the page rendered, and the cost was invisible because it was paid on
// every single navigation.
//
// These guard the two ways that regresses: someone reaching for `windowed()`
// again because it is the convenient thing in the file, and the bigint parse
// quietly going away.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test } = require("node:test");

const data = fs.readFileSync("src/lib/data.ts", "utf8");
const load = fs.readFileSync("src/lib/db/load.ts", "utf8");

const liveStatus = data.slice(
  data.indexOf("export async function getLiveStatus"),
  data.indexOf("export async function getOverview"),
);

test("getLiveStatus does not load raw events", () => {
  assert.ok(!/windowed\s*\(/.test(liveStatus),
    "getLiveStatus loads every event again — that is the 50 MB it exists to avoid");
  assert.ok(!/loadEvents\s*\(/.test(liveStatus), "getLiveStatus must not call loadEvents");
});

test("getLiveStatus asks the database for its counts", () => {
  assert.ok(/loadCounts\(/.test(liveStatus) && /loadRecentEvents\(/.test(liveStatus),
    "getLiveStatus should use the SQL aggregates");
});

test("counts are aggregated in SQL, not in JS", () => {
  const counts = load.slice(load.indexOf("export async function loadCounts"),
                            load.indexOf("export interface RecentEvent"));
  assert.ok(/count\(distinct visitor_id\)/.test(counts), "visitors must be a SQL distinct count");
  assert.ok(/count\(distinct session_id\)/.test(counts), "sessions must be a SQL distinct count");
  assert.ok(!/new Set\(/.test(counts), "counting in a JS Set means the rows were fetched");
});

test("bigint counts are parsed to numbers", () => {
  // node-postgres returns count() as a STRING to protect precision past 2^53.
  // Left unparsed these reach the UI as "135102" and any arithmetic on them
  // concatenates instead of adding — a wrong number that still looks like one.
  const counts = load.slice(load.indexOf("export async function loadCounts"),
                            load.indexOf("export interface RecentEvent"));
  for (const f of ["events", "visitors", "sessions"]) {
    assert.ok(new RegExp(`${f}:\\s*Number\\(`).test(counts),
      `${f} must be Number()-parsed, not passed through as a bigint string`);
  }
});

test("the recent strip is ordered and bounded in SQL", () => {
  const recent = load.slice(load.indexOf("export async function loadRecentEvents"));
  assert.ok(/order by ts desc/.test(recent), "newest first, decided by the database");
  assert.ok(/limit \$4/.test(recent), "the row cap must be part of the query");
});

test("one request loads a window at most once", () => {
  // The overview awaits three getters in sequence; without this each ran its
  // own full load of the same rows.
  assert.ok(/const windowed = cache\(/.test(data),
    "windowed() should be request-memoised so sibling getters share one load");
  assert.ok(/from "react"/.test(data), "cache() comes from react");
});
