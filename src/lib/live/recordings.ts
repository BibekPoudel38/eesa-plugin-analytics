import "server-only";
import { redisClient } from "./store";

/**
 * Store for rrweb session recordings, with two backends (chosen at runtime):
 *
 *  • Redis (Upstash) — production. Each session's rrweb events live in a LIST
 *    (`chups:rec:<sid>`), metadata in a HASH (`chups:recmeta:<sid>`), a SET of
 *    sessions that have a playable recording (`chups:rec:ids`), and a ZSET keyed
 *    by recency (`chups:rec:recency`) for capacity eviction.
 *  • In-memory Map — local dev.
 *
 * Replay payloads are large, so we cap events-per-session and total sessions.
 * `recordingIds()` / `hasRecording()` stay synchronous over an in-memory mirror;
 * call `hydrateRecordings()` once per request to refresh it from Redis.
 */

// rrweb events are structurally complex; we don't need their shape here.
type RRWebEvent = Record<string, unknown>;

export type Recording = {
  sessionId: string;
  siteId: string;
  device: string;
  page: string;
  firstTs: number;
  lastTs: number;
  events: RRWebEvent[];
};

const MAX_RECORDINGS = 60;
const MAX_EVENTS_PER = 8000;

const RKEY = (sid: string) => `chups:rec:${sid}`;
const MKEY = (sid: string) => `chups:recmeta:${sid}`;
const IDS = "chups:rec:ids"; // sessions with a playable recording (>1 event)
const RECENCY = "chups:rec:recency"; // sid -> lastTs, for capacity eviction

// ---- in-memory mirror -----------------------------------------------------

type RecState = { map: Map<string, Recording>; ids: Set<string> };
const g = globalThis as unknown as { __chupsRec?: RecState };
function state(): RecState {
  if (!g.__chupsRec) g.__chupsRec = { map: new Map(), ids: new Set() };
  return g.__chupsRec;
}

function coerce(x: unknown): RRWebEvent {
  return typeof x === "string" ? (JSON.parse(x) as RRWebEvent) : (x as RRWebEvent);
}

function chunkBounds(events: RRWebEvent[]) {
  let first = 0;
  let last = 0;
  for (const ev of events) {
    const ts = typeof ev.timestamp === "number" ? (ev.timestamp as number) : 0;
    if (!first || (ts && ts < first)) first = ts;
    if (ts > last) last = ts;
  }
  return { first, last };
}

// ---- writes ---------------------------------------------------------------

export async function addRecordingChunk(input: {
  sessionId: string;
  siteId: string;
  device: string;
  path: string;
  events: RRWebEvent[];
}): Promise<number> {
  const r = redisClient();
  const sid = input.sessionId;

  if (r) {
    try {
      const existing = ((await r.llen(RKEY(sid))) as number) ?? 0;
      if (existing >= MAX_EVENTS_PER) return 0;

      const { first, last } = chunkBounds(input.events);
      if (input.events.length) {
        await r.rpush(RKEY(sid), ...input.events);
        await r.ltrim(RKEY(sid), -MAX_EVENTS_PER, -1);
      }

      // merge metadata (firstTs = earliest ever, lastTs = latest ever)
      const prev = (await r.hgetall(MKEY(sid))) as Record<string, string> | null;
      const prevFirst = prev?.firstTs ? Number(prev.firstTs) : 0;
      const prevLast = prev?.lastTs ? Number(prev.lastTs) : 0;
      const firstTs = prevFirst && first ? Math.min(prevFirst, first) : prevFirst || first;
      const lastTs = Math.max(prevLast, last);
      await r.hset(MKEY(sid), {
        sessionId: sid,
        siteId: input.siteId,
        device: input.device,
        page: input.path,
        firstTs,
        lastTs,
      });
      await r.zadd(RECENCY, { score: lastTs || 0, member: sid });

      if (existing + input.events.length > 1) await r.sadd(IDS, sid);

      // evict oldest sessions beyond capacity
      const count = ((await r.zcard(RECENCY)) as number) ?? 0;
      if (count > MAX_RECORDINGS) {
        const stale = (await r.zrange(RECENCY, 0, count - MAX_RECORDINGS - 1)) as string[];
        for (const old of stale) {
          await r.del(RKEY(old));
          await r.del(MKEY(old));
          await r.srem(IDS, old);
          await r.zrem(RECENCY, old);
        }
      }
      return input.events.length;
    } catch {
      return 0; // best-effort — never fail the site's recording beacon
    }
  }

  // ---- memory backend ----
  const s = state();
  let rec = s.map.get(sid);
  if (!rec) {
    if (s.map.size >= MAX_RECORDINGS) {
      const oldest = s.map.keys().next().value;
      if (oldest) s.map.delete(oldest);
    }
    rec = {
      sessionId: sid,
      siteId: input.siteId,
      device: input.device,
      page: input.path,
      firstTs: 0,
      lastTs: 0,
      events: [],
    };
    s.map.set(sid, rec);
  }
  if (rec.events.length >= MAX_EVENTS_PER) return 0;
  for (const ev of input.events) {
    const ts = typeof ev.timestamp === "number" ? (ev.timestamp as number) : 0;
    if (!rec.firstTs || ts < rec.firstTs) rec.firstTs = ts;
    if (ts > rec.lastTs) rec.lastTs = ts;
    rec.events.push(ev);
  }
  // keep this session fresh (move to end for LRU-ish eviction)
  s.map.delete(sid);
  s.map.set(sid, rec);
  return input.events.length;
}

// ---- reads ----------------------------------------------------------------

export async function getRecording(sessionId: string): Promise<Recording | null> {
  const r = redisClient();
  if (r) {
    try {
      const raw = (await r.lrange(RKEY(sessionId), 0, -1)) as unknown[];
      if (!raw || raw.length === 0) return null;
      const meta = (await r.hgetall(MKEY(sessionId))) as Record<string, string> | null;
      return {
        sessionId,
        siteId: meta?.siteId ?? "default",
        device: meta?.device ?? "Desktop",
        page: meta?.page ?? "/",
        firstTs: meta?.firstTs ? Number(meta.firstTs) : 0,
        lastTs: meta?.lastTs ? Number(meta.lastTs) : 0,
        events: raw.map(coerce),
      };
    } catch {
      return null;
    }
  }
  return state().map.get(sessionId) ?? null;
}

/** Refresh the in-memory id mirror from Redis so the sync lookups below work. */
export async function hydrateRecordings(): Promise<void> {
  const r = redisClient();
  if (!r) return; // memory mode reads the map directly
  try {
    const ids = (await r.smembers(IDS)) as string[];
    state().ids = new Set(ids);
  } catch {
    state().ids = new Set();
  }
}

export function hasRecording(sessionId: string): boolean {
  if (redisClient()) return state().ids.has(sessionId);
  const rec = state().map.get(sessionId);
  return !!rec && rec.events.length > 1;
}

export function recordingIds(): Set<string> {
  if (redisClient()) return state().ids;
  const out = new Set<string>();
  for (const [id, rec] of state().map) if (rec.events.length > 1) out.add(id);
  return out;
}

export async function clearRecordings(): Promise<void> {
  const r = redisClient();
  if (r) {
    try {
      const ids = new Set<string>([
        ...((await r.smembers(IDS)) as string[]),
        ...((await r.zrange(RECENCY, 0, -1)) as string[]),
      ]);
      for (const sid of ids) {
        await r.del(RKEY(sid));
        await r.del(MKEY(sid));
      }
      await r.del(IDS);
      await r.del(RECENCY);
    } catch {
      /* best-effort */
    }
  }
  state().map.clear();
  state().ids.clear();
}
