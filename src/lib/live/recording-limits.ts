/**
 * Replay retention, in one place because two very different files need it.
 *
 * The recordings store (server-only, Postgres) enforces it; the player (a
 * client component) has to EXPLAIN it. A client component cannot import the
 * store — it is marked "server-only" — so without this shared module the
 * numbers would be written twice and the explanation would drift away from the
 * behaviour. That is exactly how the player came to tell people their replay
 * was missing because it was a "demo session".
 */

/**
 * How long a replay is kept, in days.
 *
 * Replays used to be capped at the 60 most recent sessions per site. A count
 * is not a duration: visits live for 90 days, so on a site with real traffic
 * the sessions list went back weeks and the replays behind it went back hours.
 * Time is also the unit people actually reason about — "we keep replays for a
 * year" is a sentence somebody can plan around; "we keep the last 60" is not,
 * because its meaning changes with traffic.
 *
 * 400 rather than 365, so "a year" survives the day the policy happens to run,
 * a late backfill and a leap year without quietly becoming eleven months.
 *
 * MUST match the retention policy on `recording_chunks` in db/schema.sql. The
 * database drops the data; this number decides what the UI offers and what it
 * says, and a disagreement shows up as a Watch button that plays nothing.
 */
export const RETENTION_DAYS = 400;

/**
 * The most events kept for ONE session.
 *
 * Not a storage policy — that is {@link RETENTION_DAYS} now — but a guard
 * against a single runaway page. An animation loop or a badly-behaved
 * third-party script can emit rrweb mutations forever, and without a ceiling
 * one visitor's open tab writes an unbounded recording that nothing else on
 * the site can outrun.
 */
export const MAX_EVENTS_PER = 8000;
