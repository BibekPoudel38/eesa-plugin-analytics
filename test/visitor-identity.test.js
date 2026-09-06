// Whether a signed-in visitor is shown as themselves.
//
// The site's own id arrives via identify(), is stored on the event, and is
// back-filled onto that visitor's earlier events through the identities join in
// load.ts. Every step of that worked — and then the sessions row discarded it,
// hardcoded `anon: true`, and labelled a paying Chups customer "u48q". Nothing
// looked broken: the visitor list was full, the counts were right, and the one
// thing identify() exists to provide was simply absent.
//
// This guards the last step, because it is the step that silently undid the
// other four.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test } = require("node:test");

const src = fs.readFileSync("src/lib/live/aggregate.ts", "utf8");
const row = src.slice(src.indexOf("function toRow("), src.indexOf("function toRow(") + 2200);

test("a session is not hardcoded anonymous", () => {
  assert.ok(!/\banon:\s*true\b/.test(row),
    "toRow() marks every session anonymous, so identify() can never show");
});

test("the site's own user id is preferred over the visitor id", () => {
  assert.ok(/user:\s*s\.userId\s*\|\|/.test(row),
    "toRow() should fall back to the visitor id only when userId is empty");
  assert.ok(/anon:\s*!s\.userId/.test(row),
    "anon should be derived from whether the visitor identified");
});

test("the aggregate carries userId at all", () => {
  const agg = src.slice(src.indexOf("type SessionAgg"), src.indexOf("type SessionAgg") + 600);
  assert.ok(/\buserId:\s*string/.test(agg), "SessionAgg must carry userId");
  assert.ok(/evts\.find\(\(e\) => e\.userId\)/.test(src),
    "the first identified event should name the whole session, since identity is retroactive");
});
