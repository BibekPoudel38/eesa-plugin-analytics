// The replay store, against a real TimescaleDB.
//
// WHY THIS NEEDS A DATABASE
// The behaviour worth testing here IS the SQL: an upsert that merges the
// earliest and latest timestamps across chunks, a cap check that has to hold
// under two concurrent POSTs, and a read that has to tell "aged out" apart
// from "never recorded". None of that can be checked by reading the source,
// and all of it is wrong in ways that look like a working system — a session
// dated 1970, a recording that quietly keeps growing, a Watch button that
// plays nothing.
//
// Run it with a throwaway Timescale:
//
//   docker run -d --name eesa-ts-test -e POSTGRES_PASSWORD=test \
//     -e POSTGRES_DB=analytics -p 55433:5432 timescale/timescaledb:latest-pg16
//   psql "$TEST_DATABASE_URL" -f db/schema.sql
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:55433/analytics \
//     node --conditions=react-server --test test/recording-store.test.js
//
// `--conditions=react-server` resolves the `server-only` marker to its empty
// build, the same way Next does on the server. Without it the import throws.
//
// Skipped, loudly, when TEST_DATABASE_URL is unset — a silent skip is how a
// suite ends up green and empty.
const assert = require("node:assert");
const { test } = require("node:test");

const DB = process.env.TEST_DATABASE_URL || "";
const skip = DB ? false : "set TEST_DATABASE_URL to run the replay-store tests";

const TENANT = "t_test";
const SITE_A = "11111111-1111-1111-1111-111111111111";
const SITE_B = "22222222-2222-2222-2222-222222222222";

let store;
let pool;

const ev = (ts, extra = {}) => ({ type: 3, timestamp: ts, data: { source: 2 }, ...extra });

test("connect", { skip }, async () => {
  process.env.DATABASE_URL = DB;
  process.env.PGSSL = "disable";
  store = await import("../src/lib/live/recordings.ts");
  pool = (await import("../src/lib/db/pool.ts")).pool;
  await store.clearRecordings(TENANT, SITE_A);
  await store.clearRecordings(TENANT, SITE_B);
});

test("a recording survives being written in pieces", { skip }, async () => {
  const sid = `s_${Date.now()}_a`;
  assert.strictEqual(
    await store.addRecordingChunk({
      tenantId: TENANT, siteId: SITE_A, sessionId: sid,
      device: "Mobile", path: "/menu",
      events: [{ type: 4, timestamp: 1000 }, { type: 2, timestamp: 1001 }],
    }),
    2,
  );
  assert.strictEqual(
    await store.addRecordingChunk({
      tenantId: TENANT, siteId: SITE_A, sessionId: sid,
      device: "Mobile", path: "/checkout",
      events: [ev(1002), ev(1003)],
    }),
    2,
  );

  const rec = await store.getRecording(TENANT, SITE_A, sid);
  assert.ok(rec, "the recording should be readable");
  assert.strictEqual(rec.events.length, 4);
  assert.strictEqual(rec.firstTs, 1000, "first_ts must be the earliest ever seen");
  assert.strictEqual(rec.lastTs, 1003, "last_ts must be the latest ever seen");
  assert.strictEqual(rec.device, "Mobile");
});

test("chunks that arrive out of order still replay in order", { skip }, async () => {
  // The realistic case: the DOM snapshot POST is large and slow, the small
  // incremental flush behind it lands first. rrweb needs Meta and FullSnapshot
  // at the front or the Replayer renders a blank frame — which the screen
  // shows as "no recording", indistinguishable from an expired one.
  const sid = `s_${Date.now()}_b`;
  const common = { tenantId: TENANT, siteId: SITE_A, sessionId: sid, device: "Desktop", path: "/" };
  await store.addRecordingChunk({ ...common, events: [ev(3000), ev(3001)] });
  await store.addRecordingChunk({
    ...common,
    events: [{ type: 4, timestamp: 2000 }, { type: 2, timestamp: 2001 }],
  });

  const rec = await store.getRecording(TENANT, SITE_A, sid);
  assert.deepStrictEqual(rec.events.map((e) => e.timestamp), [2000, 2001, 3000, 3001]);
  assert.strictEqual(rec.events[0].type, 4, "Meta must lead");
  assert.strictEqual(rec.firstTs, 2000, "the LATER-arriving earlier chunk must win first_ts");
});

test("a timestamp-less chunk cannot date a recording to 1970", { skip }, async () => {
  // chunkBounds returns first: 0 for a chunk with no usable timestamp, and 0
  // is a perfectly good "earliest" to a naive LEAST(). The scrubber would then
  // show a replay starting in 1970 and running for 56 years.
  const sid = `s_${Date.now()}_c`;
  const common = { tenantId: TENANT, siteId: SITE_A, sessionId: sid, device: "Desktop", path: "/" };
  await store.addRecordingChunk({ ...common, events: [ev(5000), ev(5500)] });
  await store.addRecordingChunk({ ...common, events: [{ type: 3, data: {} }, { type: 3 }] });

  const rec = await store.getRecording(TENANT, SITE_A, sid);
  assert.strictEqual(rec.firstTs, 5000, "a 0 bound must not win the earliest comparison");
  const [row] = await pool().query(
    "select duration_ms from recordings where tenant_id=$1 and site_id=$2 and session_id=$3",
    [TENANT, SITE_A, sid],
  ).then((r) => r.rows);
  assert.strictEqual(row.duration_ms, 500, "duration must be the real span, not 56 years");
});

test("one session cannot grow without limit", { skip }, async () => {
  const { MAX_EVENTS_PER } = await import("../src/lib/live/recording-limits.ts");
  const sid = `s_${Date.now()}_d`;
  const common = { tenantId: TENANT, siteId: SITE_A, sessionId: sid, device: "Desktop", path: "/" };
  const big = Array.from({ length: MAX_EVENTS_PER }, (_, i) => ev(1 + i));
  assert.strictEqual(await store.addRecordingChunk({ ...common, events: big }), MAX_EVENTS_PER);
  assert.strictEqual(
    await store.addRecordingChunk({ ...common, events: [ev(99999)] }),
    0,
    "a session at the cap must refuse further chunks",
  );
});

test("concurrent flushes cannot push a session past its ceiling", { skip }, async () => {
  // The recorder flushes on a timer AND immediately on each DOM snapshot, so
  // several POSTs for one session are routinely in flight together. Reading the
  // count outside a lock lets more than one of them see the same pre-cap value,
  // pass the check and write.
  //
  // It takes real concurrency to show: with only two racers the pool hands out
  // its clients far enough apart that the first transaction has committed
  // before the second issues its SELECT, and the test passes with the lock
  // removed. Eight overlap properly. Measured, with `for update` deleted: the
  // session lands on 8010 events. With it: exactly 8000.
  const { MAX_EVENTS_PER } = await import("../src/lib/live/recording-limits.ts");
  const sid = `s_${Date.now()}_e`;
  const common = { tenantId: TENANT, siteId: SITE_A, sessionId: sid, device: "Desktop", path: "/" };

  // Start ten short of the cap, so the question is live for every racer.
  await store.addRecordingChunk({
    ...common,
    events: Array.from({ length: MAX_EVENTS_PER - 10 }, (_, i) => ev(1 + i)),
  });

  // Warm the pool, or the racers queue behind connection setup and never meet.
  const warm = await Promise.all(Array.from({ length: 8 }, () => pool().connect()));
  warm.forEach((c) => c.release());

  const accepted = await Promise.all(
    Array.from({ length: 8 }, (_, r) =>
      store.addRecordingChunk({
        ...common,
        events: Array.from({ length: 10 }, (_, i) => ev(90000 + r * 100 + i)),
      })),
  );

  const [row] = await pool().query(
    "select event_count from recordings where tenant_id=$1 and site_id=$2 and session_id=$3",
    [TENANT, SITE_A, sid],
  ).then((r) => r.rows);

  assert.ok(
    row.event_count <= MAX_EVENTS_PER,
    `the ceiling was breached: ${row.event_count} events stored, cap is `
    + `${MAX_EVENTS_PER} (accepted ${JSON.stringify(accepted)})`,
  );
  assert.strictEqual(
    accepted.reduce((a, b) => a + b, 0), MAX_EVENTS_PER - (MAX_EVENTS_PER - 10),
    "exactly one 10-event flush should have been accepted",
  );
});
test("a session id from another site does not resolve", { skip }, async () => {
  // The scope is part of the lookup rather than a check applied afterwards, so
  // there is no path where a caller reads a recording and forgets to compare
  // owners. Session replay is a video of somebody using a website; this is the
  // one mistake here that is a breach rather than a bug.
  const sid = `s_${Date.now()}_f`;
  await store.addRecordingChunk({
    tenantId: TENANT, siteId: SITE_A, sessionId: sid,
    device: "Desktop", path: "/", events: [ev(1), ev(2)],
  });
  assert.strictEqual(await store.getRecording(TENANT, SITE_B, sid), null, "wrong site");
  assert.strictEqual(await store.getRecording("t_other", SITE_A, sid), null, "wrong tenant");
  assert.ok((await store.recordingIdsFor(TENANT, SITE_B)).size === 0, "wrong site lists nothing");
});

test("only playable replays are advertised", { skip }, async () => {
  // A single-event recording is a still frame; the player requires two and
  // would show the empty state. Offering a Watch button for it is a promise
  // the store cannot keep.
  const one = `s_${Date.now()}_g1`;
  const two = `s_${Date.now()}_g2`;
  const common = { tenantId: TENANT, siteId: SITE_B, device: "Desktop", path: "/" };
  await store.addRecordingChunk({ ...common, sessionId: one, events: [ev(1)] });
  await store.addRecordingChunk({ ...common, sessionId: two, events: [ev(1), ev(2)] });

  const ids = await store.recordingIdsFor(TENANT, SITE_B);
  assert.ok(ids.has(two), "a two-event recording is playable");
  assert.ok(!ids.has(one), "a one-event recording is a still frame, not a replay");
});

test("a recording whose events aged out reads as absent", { skip }, async () => {
  // Retention drops whole hypertable chunks; the summary row is a few hundred
  // bytes and stays. Returning a recording with no events would hand the
  // player a blank frame instead of the explanation.
  const sid = `s_${Date.now()}_h`;
  await store.addRecordingChunk({
    tenantId: TENANT, siteId: SITE_A, sessionId: sid,
    device: "Desktop", path: "/", events: [ev(1), ev(2)],
  });
  await pool().query(
    "delete from recording_chunks where tenant_id=$1 and site_id=$2 and session_id=$3",
    [TENANT, SITE_A, sid],
  );
  assert.strictEqual(await store.getRecording(TENANT, SITE_A, sid), null);

  // …and it is no longer offered, because the summary row is outside the window.
  await pool().query(
    "update recordings set started_at = now() - interval '500 days' "
    + "where tenant_id=$1 and site_id=$2 and session_id=$3",
    [TENANT, SITE_A, sid],
  );
  assert.ok(!(await store.recordingIdsFor(TENANT, SITE_A)).has(sid));
});

test("a bad write costs the replay, never the visitor's page", { skip }, async () => {
  // This runs on a public beacon from somebody's browser. It must not throw.
  assert.strictEqual(
    await store.addRecordingChunk({
      tenantId: TENANT, siteId: "not-a-uuid", sessionId: "s_x",
      device: "Desktop", path: "/", events: [ev(1)],
    }),
    0,
  );
  assert.strictEqual(
    await store.addRecordingChunk({
      tenantId: "", siteId: SITE_A, sessionId: "s_x",
      device: "Desktop", path: "/", events: [ev(1)],
    }),
    0,
  );
});

test("cleanup", { skip }, async () => {
  await store.clearRecordings(TENANT, SITE_A);
  await store.clearRecordings(TENANT, SITE_B);
  assert.strictEqual((await store.recordingIdsFor(TENANT, SITE_A)).size, 0);
  await pool().end();
});
