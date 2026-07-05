import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Batch, StoredEvent } from "./types";

/**
 * Tiny in-process event store for the local/tunnel demo. Events live in memory
 * (fast to aggregate) and are snapshotted to .data/events.json so a dev-server
 * restart doesn't lose the visits you just captured. Not for production — swap
 * for a real datastore in Phase 3.
 *
 * A globalThis singleton keeps a single array alive across Next's HMR reloads
 * and shared between the ingest route handler and the server components.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const MAX_EVENTS = 50_000; // ring-buffer cap so the demo can't grow unbounded

type StoreState = {
  events: StoredEvent[];
  dirty: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

const g = globalThis as unknown as { __chupsStore?: StoreState };

function load(): StoredEvent[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredEvent[];
  } catch {
    /* first run — no file yet */
  }
  return [];
}

function state(): StoreState {
  if (!g.__chupsStore) {
    g.__chupsStore = { events: load(), dirty: false, flushTimer: null };
  }
  return g.__chupsStore;
}

function scheduleFlush() {
  const s = state();
  s.dirty = true;
  if (s.flushTimer) return;
  s.flushTimer = setTimeout(() => {
    s.flushTimer = null;
    if (!s.dirty) return;
    s.dirty = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(s.events));
    } catch {
      /* best-effort persistence */
    }
  }, 2000);
}

export function ingest(batch: Batch): number {
  const s = state();
  const recvTs = batch.events.reduce((max, e) => Math.max(max, e.ts), 0) || 0;
  const enriched: StoredEvent[] = batch.events.map((e) => ({
    ...e,
    siteId: batch.meta.siteId,
    visitorId: batch.meta.visitorId,
    sessionId: batch.meta.sessionId,
    referrer: batch.meta.referrer,
    device: batch.meta.device,
    browser: batch.meta.browser,
    os: batch.meta.os,
    recvTs: recvTs || e.ts,
  }));
  s.events.push(...enriched);
  if (s.events.length > MAX_EVENTS) {
    s.events.splice(0, s.events.length - MAX_EVENTS);
  }
  scheduleFlush();
  return enriched.length;
}

export function allEvents(): StoredEvent[] {
  return state().events;
}

export function eventCount(): number {
  return state().events.length;
}

export function hasLiveData(): boolean {
  return state().events.length > 0;
}

export function clearEvents() {
  const s = state();
  s.events = [];
  scheduleFlush();
}
