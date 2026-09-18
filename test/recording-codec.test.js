// The one part of replay storage where a mistake cannot be undone.
//
// WHY THESE ARE REAL TESTS AND NOT SOURCE ASSERTIONS
// Everything else in the replay path is retryable: a failed insert loses four
// seconds of one recording. A codec that writes bytes it cannot read back
// loses EVERY replay written since the bug shipped, silently, and nobody finds
// out until somebody opens a session weeks later and the player is blank. So
// this module was deliberately kept pure and dependency-free — only node:zlib
// — specifically so it could be executed here rather than read.
//
// Run with: npm test
const assert = require("node:assert");
const { gzipSync } = require("node:zlib");
const { test } = require("node:test");

let codec;
test("load the codec", async () => {
  codec = await import("../src/lib/live/recording-codec.ts");
});

// A payload shaped like real rrweb output: a big repetitive DOM snapshot, then
// small incremental mutations.
function sampleEvents(n = 200) {
  const node = (i) => ({
    type: 2,
    id: i,
    tagName: "div",
    attributes: { class: "menu-item product-card available", "data-id": `sku-${i}` },
    childNodes: [{ type: 3, textContent: `Chicken Biryani ${i}`, id: i * 1000 }],
  });
  const events = [
    { type: 4, timestamp: 1000, data: { href: "https://example.com/menu", width: 390, height: 844 } },
    { type: 2, timestamp: 1001, data: { node: { childNodes: Array.from({ length: n }, (_, i) => node(i)) } } },
  ];
  for (let i = 0; i < n; i++) {
    events.push({ type: 3, timestamp: 1002 + i, data: { source: 2, type: 1, id: i, x: i % 390, y: i } });
  }
  return events;
}

test("what goes in comes back out, exactly", () => {
  // Deep equality, not a length check. rrweb events carry nulls, unicode,
  // deeply nested nodes and numeric ids; a codec that drops or coerces any of
  // them produces a replay that plays and is subtly wrong, which is worse than
  // one that fails.
  const events = [
    ...sampleEvents(50),
    { type: 5, timestamp: 9, data: { tag: "custom", payload: { note: "café — ok ✅", n: null } } },
    { type: 3, timestamp: 10, data: { source: 5, text: "", isChecked: false } },
  ];
  const back = codec.unpackChunk(codec.packChunk(events));
  assert.deepStrictEqual(back, events);
});

test("an empty flush round-trips to an empty array", () => {
  assert.deepStrictEqual(codec.unpackChunk(codec.packChunk([])), []);
});

test("compression is worth what the storage plan assumes", () => {
  // Keeping a year of replays is only routine because rrweb output is hugely
  // repetitive DOM text. If this ratio ever collapses — someone switches to a
  // binary event format, or starts base64-ing images into the stream — the
  // capacity maths behind RETENTION_DAYS is wrong and somebody should find out
  // here rather than from a full disk.
  const raw = Buffer.byteLength(JSON.stringify(sampleEvents(400)), "utf8");
  const packed = codec.packChunk(sampleEvents(400)).length;
  assert.ok(raw > 50_000, `sample should be substantial, was ${raw} bytes`);
  assert.ok(
    packed * 5 < raw,
    `expected better than 5x compression, got ${(raw / packed).toFixed(1)}x `
      + `(${raw} → ${packed} bytes)`,
  );
});

test("a corrupt chunk costs its own seconds, not the session", () => {
  // One unreadable row should not take a 99%-intact recording with it. The
  // player has no way to render "most of this replay is fine" if the read
  // throws, so the read never throws.
  assert.deepStrictEqual(codec.unpackChunk(Buffer.from("not gzip at all")), []);
  assert.deepStrictEqual(codec.unpackChunk(null), []);
  assert.deepStrictEqual(codec.unpackChunk(undefined), []);
  assert.deepStrictEqual(codec.unpackChunk(Buffer.alloc(0)), []);
});

test("a truncated write reads as empty, not as a throw", () => {
  // The realistic corruption: a chunk cut off mid-insert or mid-transfer.
  const full = codec.packChunk(sampleEvents(50));
  assert.deepStrictEqual(codec.unpackChunk(full.subarray(0, full.length - 10)), []);
});

test("valid gzip holding something that is not an event array reads as empty", () => {
  // Defensive against a schema change elsewhere: an object, or a JSON string,
  // must not become `[...someObject]` or a per-character array of events.
  assert.deepStrictEqual(codec.unpackChunk(gzipSync(Buffer.from('{"a":1}'))), []);
  assert.deepStrictEqual(codec.unpackChunk(gzipSync(Buffer.from('"hello"'))), []);
});

test("events are ordered by their own timestamps, not by arrival", () => {
  // Chunks are POSTed asynchronously and race under any packet loss or retry.
  // rrweb is strict: Meta and FullSnapshot must come first or the Replayer
  // renders a blank frame — which looks exactly like "no recording".
  const jumbled = [
    { type: 3, timestamp: 300 },
    { type: 4, timestamp: 100 },
    { type: 3, timestamp: 200 },
    { type: 2, timestamp: 101 },
  ];
  assert.deepStrictEqual(
    codec.orderEvents(jumbled).map((e) => e.timestamp),
    [100, 101, 200, 300],
  );
  assert.strictEqual(codec.orderEvents(jumbled)[0].type, 4, "Meta must lead");
});

test("events sharing a timestamp keep the order the recorder emitted them", () => {
  // A snapshot and the first mutation after it are frequently stamped the same
  // millisecond. Swapping them replays a mutation against a DOM that does not
  // exist yet, and rrweb throws it away.
  const same = [
    { type: 2, timestamp: 500, tag: "snapshot" },
    { type: 3, timestamp: 500, tag: "mutation-a" },
    { type: 3, timestamp: 500, tag: "mutation-b" },
  ];
  assert.deepStrictEqual(
    codec.orderEvents(same).map((e) => e.tag),
    ["snapshot", "mutation-a", "mutation-b"],
  );
});

test("ordering does not mutate what it was given", () => {
  const input = [{ timestamp: 2 }, { timestamp: 1 }];
  codec.orderEvents(input);
  assert.deepStrictEqual(input.map((e) => e.timestamp), [2, 1]);
});

test("an event with no timestamp sorts first rather than crashing", () => {
  const out = codec.orderEvents([{ timestamp: 5 }, { nope: true }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].nope, true);
});

test("bounds ignore a missing timestamp when finding the earliest", () => {
  // `first` merges with 0 meaning "nothing recorded yet". If a timestamp-less
  // event could win the comparison, a session's first_ts would be 0 and the
  // scrubber would show a recording starting in 1970 and lasting 56 years.
  assert.deepStrictEqual(codec.chunkBounds([{ nope: 1 }, { timestamp: 300 }, { timestamp: 200 }]),
    { first: 200, last: 300 });
  assert.deepStrictEqual(codec.chunkBounds([]), { first: 0, last: 0 });
  assert.deepStrictEqual(codec.chunkBounds([{ nope: 1 }]), { first: 0, last: 0 });
});
