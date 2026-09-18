/**
 * Turning rrweb events into something a database can hold for a year, and back.
 *
 * This module is deliberately pure and dependency-free — only `node:zlib` —
 * because it is the part of replay storage where a mistake is unrecoverable.
 * Everything else can be retried: a failed insert loses four seconds of a
 * recording. A codec that writes bytes it cannot read back loses every replay
 * written since the bug shipped, and nobody finds out until somebody opens a
 * session weeks later. So it is separated from the store, which needs a
 * database, and tested for real rather than by reading the source.
 *
 * WHY GZIP
 * rrweb output is DOM text: the same tag names, class names and attribute
 * strings repeated thousands of times. It compresses by roughly an order of
 * magnitude, which is the difference between a year of replays being routine
 * and being a capacity problem. Nothing ever queries inside a replay — it is
 * read whole, by session, and handed to the player — so structure in the
 * database buys nothing and costs space.
 */
import { gzipSync, gunzipSync } from "node:zlib";

/** rrweb events are structurally complex; nothing here needs their shape. */
export type RRWebEvent = Record<string, unknown>;

/**
 * Compression level.
 *
 * 6 is zlib's default and the right trade here. The ingest path runs this on
 * every flush from every recording visitor, so the CPU is paid live, on the
 * request; level 9 costs noticeably more for a few percent of size on text
 * this repetitive. Level is recorded in the gzip stream, so this can change
 * later without making today's rows unreadable.
 */
const LEVEL = 6;

/** Gzip one flush of events for storage. */
export function packChunk(events: RRWebEvent[]): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(events ?? []), "utf8"), {
    level: LEVEL,
  });
}

/**
 * Read one stored chunk back.
 *
 * Returns [] rather than throwing on a corrupt or truncated row. One bad chunk
 * should cost the seconds it covers, not the whole session: the alternative is
 * a player that shows "couldn't load" for a recording that is 99% intact.
 */
export function unpackChunk(blob: Buffer | Uint8Array | null | undefined): RRWebEvent[] {
  if (!blob || blob.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(gunzipSync(blob).toString("utf8"));
    return Array.isArray(parsed) ? (parsed as RRWebEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * The timestamps a chunk spans.
 *
 * Used to keep a session's first/last on the summary row so the sessions list
 * and the player's scrubber know a recording's length without reading it.
 * `first` is 0 for an empty or timestamp-less chunk, and callers merge with
 * `0` meaning "nothing yet" rather than "the epoch".
 */
export function chunkBounds(events: RRWebEvent[]): { first: number; last: number } {
  let first = 0;
  let last = 0;
  for (const ev of events ?? []) {
    const ts = typeof ev?.timestamp === "number" ? ev.timestamp : 0;
    if (!first || (ts && ts < first)) first = ts;
    if (ts > last) last = ts;
  }
  return { first, last };
}

/**
 * Put a session's events back in playable order.
 *
 * Chunks are POSTed asynchronously and arrive out of order under any packet
 * loss or retry, and rrweb is strict about this: the Meta and FullSnapshot
 * events must come first or the Replayer renders a blank frame. Sorting by the
 * event's own timestamp — not by arrival, not by row order — is what makes a
 * replay survive a flaky mobile connection.
 *
 * The sort is STABLE (V8's Array#sort is), so events sharing a timestamp keep
 * the order the recorder emitted them in. That matters: a snapshot and the
 * first mutation after it are frequently stamped the same millisecond, and
 * swapping them replays the mutation against a DOM that does not exist yet.
 */
export function orderEvents(events: RRWebEvent[]): RRWebEvent[] {
  return [...(events ?? [])].sort(
    (a, b) =>
      (typeof a?.timestamp === "number" ? a.timestamp : 0)
      - (typeof b?.timestamp === "number" ? b.timestamp : 0),
  );
}
