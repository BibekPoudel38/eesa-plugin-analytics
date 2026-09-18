// One person's sessions, by the id the site passed to identify().
//
// WHY THIS EXISTS
// The Customer 360 page in Eesa shows a support agent everything known about
// one customer. The sessions here are the missing half — what they actually did
// on the site, and the replay of it — and the join is the id: the storefront
// calls identify('CUS-045') and the profile page is opened for CUS-045.
//
// THE TRAP THIS GUARDS
// `liveSessions()` slices to the 24 most recent sessions across the WHOLE site
// before it builds rows. The obvious implementation —
// `liveSessions(...).filter(s => s.user === person)` — therefore answers "did
// this person appear in the last 24 visits anybody made", which on a busy site
// is almost always no. It would not have thrown, or logged, or looked wrong: a
// customer with fifty visits would simply show none, and read as somebody who
// had never been to the site.
//
// Run with: npm test
const assert = require("node:assert");
const fs = require("node:fs");
const { test } = require("node:test");

const agg = fs.readFileSync("src/lib/live/aggregate.ts", "utf8");
const mcp = fs.readFileSync("src/app/mcp/route.ts", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

const fn = agg.slice(
  agg.indexOf("export function sessionsForUser("),
  agg.indexOf("export function liveSessionDetail("),
);

test("sessionsForUser exists and is exported", () => {
  assert.ok(fn.length > 0, "sessionsForUser is missing from aggregate.ts");
});

test("it filters BEFORE it caps, not after", () => {
  // The whole point. `.filter(...)` must come before `.slice(...)`, or the cap
  // is applied to the site's sessions rather than to this person's.
  const filterAt = fn.indexOf(".filter(");
  const sliceAt = fn.indexOf(".slice(");
  assert.ok(filterAt !== -1, "no filter — every caller would get the whole site");
  assert.ok(sliceAt !== -1, "no cap — one query could return every session ever");
  assert.ok(
    filterAt < sliceAt,
    "slice() runs before filter(), so this returns whoever appears in the "
      + "most recent page of the SITE's sessions rather than this person's",
  );
});

test("it never reuses liveSessions, which caps at 24 site-wide", () => {
  assert.ok(
    !/liveSessions\s*\(/.test(fn),
    "sessionsForUser delegates to liveSessions(), which slices to 24 before "
      + "anything can filter",
  );
});

test("the id match is exact, so CUS-1 cannot answer for CUS-1042", () => {
  // These are ids. A `startsWith` or `includes` would attribute one customer's
  // browsing to another, which is worse than showing nothing.
  assert.ok(
    !/\.(startsWith|includes)\(/.test(fn),
    "a prefix or substring match would let one customer id answer for another",
  );
  assert.ok(/===/.test(fn), "expected an exact comparison");
  assert.ok(/toLowerCase\(\)/.test(fn), "ids should compare case-insensitively");
});

test("an empty id returns nothing rather than everybody", () => {
  assert.ok(
    /if\s*\(!want\)\s*return\s*\[\]/.test(fn.replace(/\s+/g, " ")),
    "an empty person id must return no sessions; falling through would match "
      + "every session whose userId is also empty — i.e. every anonymous visit",
  );
});

test("the MCP tool is declared, and requires the person", () => {
  assert.ok(/name:\s*"person_sessions"/.test(mcp), "tool not declared");
  const decl = mcp.slice(mcp.indexOf('name: "person_sessions"'));
  assert.ok(/required:\s*\["person"\]/.test(decl.slice(0, 1200)),
    "person must be required — without it the tool would answer for nobody");
});

test("the tool returns JSON, because a screen reads it", () => {
  // The other three tools answer an agent and prose suits them. This one is
  // rendered by the Customer 360 page, and a sentence would have to be parsed
  // back apart at the far end.
  const handler = mcp.slice(mcp.indexOf('if (name === "person_sessions")'));
  assert.ok(/toolJson\(/.test(handler.slice(0, 2000)),
    "person_sessions should return structured JSON, not prose");
  assert.ok(/structuredContent/.test(mcp),
    "the payload should also be offered as structuredContent");
});

test("the answer carries its own window", () => {
  // The store is a rolling window. Without the range in the payload, "no
  // sessions" is indistinguishable from "never visited", and somebody would
  // conclude a customer had never used the site.
  const handler = mcp.slice(mcp.indexOf('if (name === "person_sessions")'));
  assert.ok(/\brange\b/.test(handler.slice(0, 1500)),
    "the result should say which window it covers");
});

test("a person lookup defaults to a wider window than a traffic chart", () => {
  assert.ok(/person_sessions" \?\s*"30d"/.test(mcp),
    "7d is right for a traffic chart and too narrow for a support question");
});

test("the manifest advertises it, or Eesa will never offer it", () => {
  const names = manifest.surfaces.mcp.tools.map((t) => t.name);
  assert.ok(names.includes("person_sessions"),
    "declared in the route but not in the manifest: the gateway lists tools "
      + "from the manifest, so it would be invisible to Eesa");
});

// ---------------------------------------------------------------------------
// What the Customer 360 panel needs on top of the session list
// ---------------------------------------------------------------------------

test("a session says WHEN it happened, not just how long ago", () => {
  // The panel sits beside this customer's order history. "42 minutes ago"
  // cannot be lined up against an order timestamp without the reader knowing
  // when the server computed it, and every caller reconstructing it from
  // startedMinutesAgo would do so with its own clock skew.
  assert.ok(/startedAt:\s*s\.firstTs/.test(agg) && /endedAt:\s*s\.lastTs/.test(agg),
    "sessionsForUser should carry the absolute span, which the aggregate has");
  const handler = mcp.slice(mcp.indexOf('if (name === "person_sessions")'));
  assert.ok(/startedAt: r\.startedAt/.test(handler.slice(0, 3000)),
    "the tool should pass the absolute start through");
});

test("the replay link is built where the origin is known", () => {
  // The plugin knows its own address; the calling app does not, and hardcoding
  // it there means a link that breaks on every other deployment.
  assert.ok(/function publicOrigin\(/.test(mcp), "no origin helper");
  assert.ok(/x-forwarded-host/.test(mcp),
    "behind a proxy req.url is the internal container address, so a link built "
    + "from it opens nothing from a browser");
  assert.ok(/callTool\(ctx, name, args, publicOrigin\(req\)\)/.test(mcp),
    "the origin must actually reach callTool");
});

test("a replay link is only offered when there is a replay", () => {
  // A Watch button that opens "no recording for this session" is worse than no
  // button: somebody clicks it twice and reports the player as broken.
  const handler = mcp.slice(mcp.indexOf('if (name === "person_sessions")'));
  const link = handler.slice(handler.indexOf("replayUrl:"), handler.indexOf("outcome: r.outcome"));
  assert.ok(/r\.hasRecording/.test(link) && /r\.replayId/.test(link) && /origin/.test(link),
    "replayUrl should require a recording, an id and a known origin");
  assert.ok(/:\s*null/.test(link), "and be null otherwise, not an empty string");
});

test("the replay link carries the site, because the player requires it", () => {
  // /api/rec/[id] is tenant+site scoped; the player passes `site` through and
  // 400s without it, showing "couldn't load the replay engine" with no clue why.
  const handler = mcp.slice(mcp.indexOf('if (name === "person_sessions")'));
  assert.ok(/site=\$\{encodeURIComponent\(site\.id\)\}/.test(handler.slice(0, 3000)),
    "the watch URL needs ?site=");
});
