/**
 * Replay retention, in one place because two very different files need it.
 *
 * The recordings store (server-only, Redis) enforces it; the player (a client
 * component) has to EXPLAIN it. A client component cannot import the store —
 * it is marked "server-only" — so without this shared module the number would
 * be written twice and the explanation would drift away from the behaviour.
 *
 * Note this is a count, not a duration. Visits and events are kept in Postgres
 * for 90 days; replays are kept in Redis for the most recent visits only,
 * because a replay is the DOM of every page, orders of magnitude larger than
 * the events describing it. A busy site therefore has a session list going
 * back weeks and replays going back hours, which reads as "the player is
 * broken" unless the screen says so.
 */
export const MAX_RECORDINGS = 60; // per site
