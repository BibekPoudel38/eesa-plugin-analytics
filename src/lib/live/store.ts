import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { Batch, StoredEvent } from "./types";

/**
 * Event store with two backends, chosen at runtime:
 *
 *  • Redis (Upstash)  — when REST creds are present in the env. Events live in a
 *    single Redis LIST so the collect endpoint and the dashboard share state
 *    across stateless serverless instances (Vercel). This is the production path.
 *  • Local file       — no creds (local dev). Events live in an in-process array
 *    snapshotted to .data/events.json so a dev-server restart keeps recent visits.
 *
 * Reads are synchronous over an in-memory array; call `hydrateEvents()` once at
 * the start of a request to populate it from the active backend, then aggregate.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "events.json");
const MAX_EVENTS = 50_000; // ring-buffer cap so the demo can't grow unbounded
const REDIS_KEY = "eesa:events";

// ---- backend selection ----------------------------------------------------

function redisCreds() {
  // Support both Upstash-native and Vercel-Marketplace (KV_*) variable names.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  return url && token ? { url, token } : null;
}

const gr = globalThis as unknown as { __eesaRedis?: Redis | null };
function redis(): Redis | null {
  if (gr.__eesaRedis !== undefined) return gr.__eesaRedis;
  const creds = redisCreds();
  gr.__eesaRedis = creds ? new Redis(creds) : null;
  return gr.__eesaRedis;
}

export function usingRedis(): boolean {
  return redis() !== null;
}

/** Shared Redis client (or null in file mode) — reused by the recordings store. */
export function redisClient(): Redis | null {
  return redis();
}

// ---- in-memory mirror + file snapshot -------------------------------------

type StoreState = {
  events: StoredEvent[];
  loaded: boolean; // file backend: has the snapshot been read yet
  dirty: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

const g = globalThis as unknown as { __eesaStore?: StoreState };

function state(): StoreState {
  if (!g.__eesaStore) {
    g.__eesaStore = { events: [], loaded: false, dirty: false, flushTimer: null };
  }
  return g.__eesaStore;
}

function loadFile(): StoredEvent[] {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredEvent[];
  } catch {
    /* first run — no file yet */
  }
  return [];
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

function coerce(x: unknown): StoredEvent {
  // Upstash auto-deserializes JSON, but be defensive if a raw string comes back.
  return typeof x === "string" ? (JSON.parse(x) as StoredEvent) : (x as StoredEvent);
}

// ---- public API -----------------------------------------------------------

/** Populate the in-memory mirror from the active backend for this request. */
export async function hydrateEvents(): Promise<void> {
  const s = state();
  const r = redis();
  if (r) {
    const raw = (await r.lrange(REDIS_KEY, 0, -1)) as unknown[];
    s.events = raw.map(coerce);
    return;
  }
  if (!s.loaded) {
    s.events = loadFile();
    s.loaded = true;
  }
}

export async function ingest(batch: Batch): Promise<number> {
  const s = state();
  const recvTs = batch.events.reduce((max, e) => Math.max(max, e.ts), 0) || 0;
  const enriched: StoredEvent[] = batch.events.map((e) => ({
    ...e,
    siteId: batch.meta.siteId,
    visitorId: batch.meta.visitorId,
    sessionId: batch.meta.sessionId,
    userId: batch.meta.userId || "",
    referrer: batch.meta.referrer,
    device: batch.meta.device,
    browser: batch.meta.browser,
    os: batch.meta.os,
    location: batch.meta.location || "—",
    origin: batch.meta.origin || "",
    recvTs: recvTs || e.ts,
  }));
  if (!enriched.length) return 0;

  const r = redis();
  if (r) {
    await r.rpush(REDIS_KEY, ...enriched);
    await r.ltrim(REDIS_KEY, -MAX_EVENTS, -1);
    return enriched.length;
  }

  if (!s.loaded) {
    s.events = loadFile();
    s.loaded = true;
  }
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

export async function clearEvents(): Promise<void> {
  const s = state();
  s.events = [];
  const r = redis();
  if (r) {
    await r.del(REDIS_KEY);
    return;
  }
  scheduleFlush();
}
