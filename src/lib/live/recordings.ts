import "server-only";

/**
 * In-memory store for rrweb session recordings. Kept separate from the event
 * store because replay payloads are large — we cap the number of retained
 * sessions and events per session, and don't persist to disk in the demo.
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

type RecState = { map: Map<string, Recording> };
const g = globalThis as unknown as { __chupsRec?: RecState };

function state(): RecState {
  if (!g.__chupsRec) g.__chupsRec = { map: new Map() };
  return g.__chupsRec;
}

export function addRecordingChunk(input: {
  sessionId: string;
  siteId: string;
  device: string;
  path: string;
  events: RRWebEvent[];
}): number {
  const s = state();
  let rec = s.map.get(input.sessionId);
  if (!rec) {
    // evict oldest if at capacity
    if (s.map.size >= MAX_RECORDINGS) {
      const oldest = s.map.keys().next().value;
      if (oldest) s.map.delete(oldest);
    }
    rec = {
      sessionId: input.sessionId,
      siteId: input.siteId,
      device: input.device,
      page: input.path,
      firstTs: 0,
      lastTs: 0,
      events: [],
    };
    s.map.set(input.sessionId, rec);
  }
  if (rec.events.length >= MAX_EVENTS_PER) return 0;

  for (const ev of input.events) {
    const ts = typeof ev.timestamp === "number" ? (ev.timestamp as number) : 0;
    if (!rec.firstTs || ts < rec.firstTs) rec.firstTs = ts;
    if (ts > rec.lastTs) rec.lastTs = ts;
    rec.events.push(ev);
  }
  // keep this session fresh (move to end for LRU-ish eviction)
  s.map.delete(input.sessionId);
  s.map.set(input.sessionId, rec);
  return input.events.length;
}

export function getRecording(sessionId: string): Recording | null {
  return state().map.get(sessionId) ?? null;
}

export function hasRecording(sessionId: string): boolean {
  const r = state().map.get(sessionId);
  return !!r && r.events.length > 1;
}

export function recordingIds(): Set<string> {
  const out = new Set<string>();
  for (const [id, r] of state().map) if (r.events.length > 1) out.add(id);
  return out;
}

export function clearRecordings() {
  state().map.clear();
}
