import "server-only";
import { redisClient } from "./store";

/**
 * Store for rrweb session recordings.
 *
 * EVERY key is partitioned by (tenant, site). That is not decoration: the
 * ingest endpoint deliberately refused to store anything until it was true,
 * with the note "so no un-partitioned replay data is ever written". The old
 * layout keyed on the session id alone (`eesa:rec:<sid>`), and the read route
 * had no auth at all — so storing under it would have let anyone who knew or
 * guessed a session id replay another tenant's screen recording. Session
 * replay is the most sensitive data this plugin holds; it is literally a video
 * of someone using a website.
 *
 * Two backends, chosen at runtime:
 *  • Redis (Upstash) — production, shared across instances.
 *  • In-memory Map — local dev only. Dies with the process, so replay is not
 *    usable in production without UPSTASH_REDIS_REST_URL/_TOKEN.
 *
 * Caps are PER SITE, so one busy site cannot evict another's replays.
 *
 * There is no synchronous "does this session have a recording" mirror any more.
 * It existed to be read from inside the pure aggregators, needed a
 * `hydrateRecordings()` call per request to not be stale, and could not express
 * a tenant scope. Callers now await `recordingIdsFor(tenant, site)` and pass the
 * result in — one less way to read the wrong tenant's state.
 */

// rrweb events are structurally complex; we don't need their shape here.
type RRWebEvent = Record<string, unknown>;

export interface RecordingScope {
  tenantId: string;
  siteId: string;
}

export type Recording = {
  sessionId: string;
  tenantId: string;
  siteId: string;
  device: string;
  page: string;
  firstTs: number;
  lastTs: number;
  events: RRWebEvent[];
};

const MAX_RECORDINGS = 60; // per site
const MAX_EVENTS_PER = 8000;

// A tenant id or site id containing ':' would let one scope forge another's
// key prefix. They are a UUID and an Eesa tenant id, but this is the one place
// where being wrong is a cross-tenant read, so it is enforced rather than
// assumed.
const seg = (v: string) => encodeURIComponent(String(v ?? "")).replace(/%/g, "_");
const scopeKey = (s: RecordingScope) => `${seg(s.tenantId)}:${seg(s.siteId)}`;

const RKEY = (s: RecordingScope, sid: string) => `eesa:rec:${scopeKey(s)}:${seg(sid)}`;
const MKEY = (s: RecordingScope, sid: string) => `eesa:recmeta:${scopeKey(s)}:${seg(sid)}`;
const IDS = (s: RecordingScope) => `eesa:rec:ids:${scopeKey(s)}`;
const RECENCY = (s: RecordingScope) => `eesa:rec:recency:${scopeKey(s)}`;

// ---- in-memory backend (dev) ----------------------------------------------

type RecState = { map: Map<string, Recording> };
const g = globalThis as unknown as { __eesaRec?: RecState };
function state(): RecState {
  if (!g.__eesaRec) g.__eesaRec = { map: new Map() };
  return g.__eesaRec;
}
/** Memory keys carry the scope too, so dev mirrors production isolation. */
const memKey = (s: RecordingScope, sid: string) => `${scopeKey(s)}|${sid}`;

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
  tenantId: string;
  siteId: string;
  sessionId: string;
  device: string;
  path: string;
  events: RRWebEvent[];
}): Promise<number> {
  const scope: RecordingScope = { tenantId: input.tenantId, siteId: input.siteId };
  if (!scope.tenantId || !scope.siteId || !input.sessionId) return 0;

  const r = redisClient();
  const sid = input.sessionId;

  if (r) {
    try {
      const existing = ((await r.llen(RKEY(scope, sid))) as number) ?? 0;
      if (existing >= MAX_EVENTS_PER) return 0;

      const { first, last } = chunkBounds(input.events);
      if (input.events.length) {
        await r.rpush(RKEY(scope, sid), ...input.events);
        await r.ltrim(RKEY(scope, sid), -MAX_EVENTS_PER, -1);
      }

      // merge metadata (firstTs = earliest ever, lastTs = latest ever)
      const prev = (await r.hgetall(MKEY(scope, sid))) as Record<string, string> | null;
      const prevFirst = prev?.firstTs ? Number(prev.firstTs) : 0;
      const prevLast = prev?.lastTs ? Number(prev.lastTs) : 0;
      const firstTs = prevFirst && first ? Math.min(prevFirst, first) : prevFirst || first;
      const lastTs = Math.max(prevLast, last);
      await r.hset(MKEY(scope, sid), {
        sessionId: sid,
        tenantId: scope.tenantId,
        siteId: scope.siteId,
        device: input.device,
        page: input.path,
        firstTs,
        lastTs,
      });
      await r.zadd(RECENCY(scope), { score: lastTs || 0, member: sid });

      // A single-event recording is a still frame, not a replay — the player
      // requires >= 2 events, so only advertise it past that.
      if (existing + input.events.length > 1) await r.sadd(IDS(scope), sid);

      // evict this SITE's oldest sessions beyond capacity
      const count = ((await r.zcard(RECENCY(scope))) as number) ?? 0;
      if (count > MAX_RECORDINGS) {
        const stale = (await r.zrange(RECENCY(scope), 0, count - MAX_RECORDINGS - 1)) as string[];
        for (const old of stale) {
          await r.del(RKEY(scope, old));
          await r.del(MKEY(scope, old));
          await r.srem(IDS(scope), old);
          await r.zrem(RECENCY(scope), old);
        }
      }
      return input.events.length;
    } catch {
      return 0; // best-effort — never fail the site's recording beacon
    }
  }

  // ---- memory backend ----
  const s = state();
  const key = memKey(scope, sid);
  let rec = s.map.get(key);
  if (!rec) {
    if (s.map.size >= MAX_RECORDINGS) {
      const oldest = s.map.keys().next().value;
      if (oldest) s.map.delete(oldest);
    }
    rec = {
      sessionId: sid,
      tenantId: scope.tenantId,
      siteId: scope.siteId,
      device: input.device,
      page: input.path,
      firstTs: 0,
      lastTs: 0,
      events: [],
    };
    s.map.set(key, rec);
  }
  if (rec.events.length >= MAX_EVENTS_PER) return 0;
  for (const ev of input.events) {
    const ts = typeof ev.timestamp === "number" ? (ev.timestamp as number) : 0;
    if (!rec.firstTs || ts < rec.firstTs) rec.firstTs = ts;
    if (ts > rec.lastTs) rec.lastTs = ts;
    rec.events.push(ev);
  }
  // keep this session fresh (move to end for LRU-ish eviction)
  s.map.delete(key);
  s.map.set(key, rec);
  return input.events.length;
}

// ---- reads ----------------------------------------------------------------

/**
 * One session's replay, WITHIN a tenant+site.
 *
 * The scope is part of the lookup, not a check applied afterwards: a session id
 * belonging to another tenant simply does not resolve, so there is no path
 * where a caller reads a recording and then forgets to compare owners.
 */
export async function getRecording(
  tenantId: string,
  siteId: string,
  sessionId: string,
): Promise<Recording | null> {
  const scope: RecordingScope = { tenantId, siteId };
  if (!tenantId || !siteId || !sessionId) return null;

  const r = redisClient();
  if (r) {
    try {
      const raw = (await r.lrange(RKEY(scope, sessionId), 0, -1)) as unknown[];
      if (!raw || raw.length === 0) return null;
      const meta = (await r.hgetall(MKEY(scope, sessionId))) as Record<string, string> | null;
      return {
        sessionId,
        tenantId,
        siteId,
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
  return state().map.get(memKey(scope, sessionId)) ?? null;
}

/**
 * Session ids with a playable replay for this site — what the sessions and
 * visitors lists use to draw the "Watch" affordance.
 */
export async function recordingIdsFor(
  tenantId: string,
  siteId: string,
): Promise<Set<string>> {
  if (!tenantId || !siteId) return new Set();
  const scope: RecordingScope = { tenantId, siteId };
  const r = redisClient();
  if (r) {
    try {
      return new Set((await r.smembers(IDS(scope))) as string[]);
    } catch {
      return new Set();
    }
  }
  const out = new Set<string>();
  const prefix = `${scopeKey(scope)}|`;
  for (const [key, rec] of state().map) {
    if (key.startsWith(prefix) && rec.events.length > 1) out.add(rec.sessionId);
  }
  return out;
}

/** Drop every replay for one site (admin / test helper). */
export async function clearRecordings(tenantId: string, siteId: string): Promise<void> {
  const scope: RecordingScope = { tenantId, siteId };
  const r = redisClient();
  if (r) {
    try {
      const ids = new Set<string>([
        ...((await r.smembers(IDS(scope))) as string[]),
        ...((await r.zrange(RECENCY(scope), 0, -1)) as string[]),
      ]);
      for (const sid of ids) {
        await r.del(RKEY(scope, sid));
        await r.del(MKEY(scope, sid));
      }
      await r.del(IDS(scope));
      await r.del(RECENCY(scope));
    } catch {
      /* best-effort */
    }
  }
  const prefix = `${scopeKey(scope)}|`;
  for (const key of [...state().map.keys()]) {
    if (key.startsWith(prefix)) state().map.delete(key);
  }
}
