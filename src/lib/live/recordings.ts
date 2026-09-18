import "server-only";
import { query, tx } from "../db/pool";
import { MAX_EVENTS_PER, RETENTION_DAYS } from "./recording-limits";
import { chunkBounds, orderEvents, packChunk, unpackChunk } from "./recording-codec";
import type { RRWebEvent } from "./recording-codec";

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
 * WHY THIS IS POSTGRES AND NOT REDIS
 * This used to be Redis, capped at the 60 most recent sessions PER SITE. That
 * cap is a COUNT, not a duration, and the two are not close: visits live in
 * Postgres for 90 days, so on a site with real traffic the sessions list went
 * back weeks while the replays behind it went back hours. Practically every
 * session anybody opened said "no recording", and read as a broken player
 * rather than as a store that had already thrown the recording away.
 *
 * Redis is also the wrong promise. It is a cache: an eviction, a restart, a
 * plan change or a missing credential loses everything in it, and the fallback
 * when the credential WAS missing was an in-process Map that died on every
 * deploy. Replays are now kept for {@link RETENTION_DAYS} days in the database
 * the plugin already owns, with no count cap at all — the limit is time, which
 * is the thing people actually reason about.
 *
 * The per-session {@link MAX_EVENTS_PER} cap stays. It is not storage policy;
 * it stops one runaway page — an animation loop, a badly-behaved third-party
 * script — from writing an unbounded recording.
 */

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

export type { RRWebEvent };

// ---- writes ---------------------------------------------------------------

/**
 * Store one flush of a live recording.
 *
 * Returns the number of events accepted — 0 when the site is unknown, the
 * session has hit its event cap, or the write failed. It NEVER throws: this
 * runs on a public beacon from someone's browser, and a database blip must
 * cost that visitor's replay, not their page.
 *
 * The count check and the write are one transaction with the summary row
 * locked, because chunks from a single visitor overlap: the recorder flushes
 * on a timer AND immediately on a DOM snapshot, so two POSTs are routinely in
 * flight together. Reading the count outside the lock would let both pass the
 * cap check and both write.
 */
export async function addRecordingChunk(input: {
  tenantId: string;
  siteId: string;
  sessionId: string;
  device: string;
  path: string;
  events: RRWebEvent[];
}): Promise<number> {
  const { tenantId, siteId, sessionId } = input;
  if (!tenantId || !siteId || !sessionId) return 0;
  if (!input.events?.length) return 0;

  const blob = packChunk(input.events);
  const { first, last } = chunkBounds(input.events);
  const n = input.events.length;

  try {
    return await tx(async (c) => {
      // Lock this session's summary row, if it exists, for the duration.
      const seen = await c.query<{ event_count: number }>(
        `select event_count from recordings
          where tenant_id = $1 and site_id = $2 and session_id = $3
          for update`,
        [tenantId, siteId, sessionId],
      );
      const already = seen.rows[0]?.event_count ?? 0;
      if (already >= MAX_EVENTS_PER) return 0;

      await c.query(
        `insert into recording_chunks
           (tenant_id, site_id, session_id, n_events, size_bytes, events)
         values ($1, $2, $3, $4, $5, $6)`,
        [tenantId, siteId, sessionId, n, blob.length, blob],
      );

      // `least`/`greatest` over NULLIF so a zero — "this chunk carried no
      // usable timestamp" — never wins the earliest-ever comparison and dates
      // the whole recording to 1970.
      await c.query(
        `insert into recordings
           (tenant_id, site_id, session_id, object_key, device, page,
            first_ts, last_ts, event_count, size_bytes, duration_ms)
         values ($1, $2, $3, '', $4, $5, $6, $7, $8, $9, 0)
         on conflict (tenant_id, site_id, session_id) do update set
           device      = excluded.device,
           page        = excluded.page,
           first_ts    = coalesce(least(nullif(recordings.first_ts, 0),
                                        nullif(excluded.first_ts, 0)), 0),
           last_ts     = greatest(recordings.last_ts, excluded.last_ts),
           event_count = recordings.event_count + excluded.event_count,
           size_bytes  = recordings.size_bytes + excluded.size_bytes,
           duration_ms = greatest(
             0,
             greatest(recordings.last_ts, excluded.last_ts)
               - coalesce(least(nullif(recordings.first_ts, 0),
                                nullif(excluded.first_ts, 0)), 0)
           )::integer,
           updated_at  = now()`,
        [tenantId, siteId, sessionId, input.device || "Desktop",
         input.path || "/", first, last, n, blob.length],
      );

      return n;
    });
  } catch {
    return 0; // best-effort — never fail the site's recording beacon
  }
}

// ---- reads ----------------------------------------------------------------

/**
 * One session's replay, WITHIN a tenant+site.
 *
 * The scope is part of the lookup, not a check applied afterwards: a session
 * id belonging to another tenant simply does not resolve, so there is no path
 * where a caller reads a recording and then forgets to compare owners.
 *
 * Events come back in playable order. Chunks are ordered by arrival here and
 * then by their own timestamps in {@link orderEvents} — arrival order alone is
 * not enough, because the POSTs race.
 */
export async function getRecording(
  tenantId: string,
  siteId: string,
  sessionId: string,
): Promise<Recording | null> {
  if (!tenantId || !siteId || !sessionId) return null;
  try {
    const meta = await query<{
      device: string; page: string; first_ts: string; last_ts: string;
    }>(
      `select device, page, first_ts, last_ts from recordings
        where tenant_id = $1 and site_id = $2 and session_id = $3`,
      [tenantId, siteId, sessionId],
    );
    if (!meta.length) return null;

    const rows = await query<{ events: Buffer }>(
      `select events from recording_chunks
        where tenant_id = $1 and site_id = $2 and session_id = $3
        order by created_at`,
      [tenantId, siteId, sessionId],
    );
    // The summary row outlives its chunks by design: retention drops whole
    // hypertable chunks, and the summary is a few hundred bytes worth keeping.
    // An expired replay must read as absent, not as an empty one.
    if (!rows.length) return null;

    const events = orderEvents(rows.flatMap((r) => unpackChunk(r.events)));
    if (!events.length) return null;

    const m = meta[0];
    return {
      sessionId,
      tenantId,
      siteId,
      device: m.device || "Desktop",
      page: m.page || "/",
      firstTs: Number(m.first_ts) || 0,
      lastTs: Number(m.last_ts) || 0,
      events,
    };
  } catch {
    return null;
  }
}

/**
 * Session ids with a playable replay for this site — what the sessions and
 * visitors lists use to draw the "Watch" affordance.
 *
 * Bounded by the retention window and by `event_count > 1`. A single-event
 * recording is a still frame, not a replay, and the player requires two; and a
 * session whose chunks have aged out must not be offered, or the affordance
 * promises something the store has already dropped.
 */
export async function recordingIdsFor(
  tenantId: string,
  siteId: string,
): Promise<Set<string>> {
  if (!tenantId || !siteId) return new Set();
  try {
    const rows = await query<{ session_id: string }>(
      `select session_id from recordings
        where tenant_id = $1 and site_id = $2
          and event_count > 1
          and started_at >= now() - ($3 || ' days')::interval`,
      [tenantId, siteId, String(RETENTION_DAYS)],
    );
    return new Set(rows.map((r) => r.session_id));
  } catch {
    return new Set();
  }
}

/** Drop every replay for one site (admin / test helper). */
export async function clearRecordings(tenantId: string, siteId: string): Promise<void> {
  if (!tenantId || !siteId) return;
  try {
    await tx(async (c) => {
      await c.query(
        `delete from recording_chunks where tenant_id = $1 and site_id = $2`,
        [tenantId, siteId],
      );
      await c.query(
        `delete from recordings where tenant_id = $1 and site_id = $2`,
        [tenantId, siteId],
      );
    });
  } catch {
    /* best-effort */
  }
}
