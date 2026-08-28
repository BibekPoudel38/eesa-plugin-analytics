import "server-only";
import { query } from "./pool";

/**
 * Identities — the visitor→user link behind retroactive identification.
 *
 * A site calls identify() once, after its own login, with its own user id. That
 * lands here as a single row. Nothing in `events` is ever rewritten: rows
 * captured before the login keep `user_id = ''` exactly as they were, and the
 * read path resolves them through this table instead (see db/load.ts).
 *
 * See the table comment in db/schema.sql for why this is a mapping rather than
 * an UPDATE — short version: `events` is a hypertable behind a continuous
 * aggregate, and one insert here covers a visitor's whole history, including
 * buckets that have already been materialised.
 *
 * The id is the SITE's, not ours. We never parse it.
 */

/**
 * Longest user id we will store. Generous enough for a UUID, an email, or a
 * prefixed external key, short enough that a hostile site can't use the field
 * as free storage — the ingest plane is public and authenticated only by a
 * tracking key that sits in plain sight in the page source.
 */
export const MAX_USER_ID = 128;

/**
 * Normalise a user id arriving from a browser. Returns "" for anything that
 * isn't a usable id, which the callers treat as "stayed anonymous" rather than
 * as an error — a bad value must never cost a site its events.
 */
export function cleanUserId(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Drop control characters, which would otherwise survive into dashboards
  // and CSV exports. Done by code point rather than by regex so that ordinary
  // id punctuation — the hyphens in a UUID above all — is left untouched.
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out.trim().slice(0, MAX_USER_ID);
}

/**
 * Record (or refresh) the link between one visitor and one user.
 *
 * `first_seen` is deliberately left alone on conflict: it marks when this
 * device was first tied to this person, which is the more useful fact once a
 * visitor has signed in repeatedly. A visitor re-identified as a DIFFERENT user
 * overwrites — that is a shared device, and the most recent sign-in is the best
 * available answer for the traffic that follows it.
 */
export async function linkIdentity(
  tenantId: string,
  siteId: string,
  visitorId: string,
  userId: string,
): Promise<void> {
  if (!visitorId || !userId) return;
  await query(
    `insert into identities (tenant_id, site_id, visitor_id, user_id)
     values ($1, $2, $3, $4)
     on conflict (tenant_id, site_id, visitor_id) do update
        set user_id    = excluded.user_id,
            updated_at = now()
      where identities.user_id is distinct from excluded.user_id`,
    [tenantId, siteId, visitorId, userId],
  );
}

/** Every visitor id (device) a given user has been seen on for this site. */
export async function visitorsForUser(
  tenantId: string,
  siteId: string,
  userId: string,
): Promise<string[]> {
  if (!userId) return [];
  const rows = await query<{ visitor_id: string }>(
    `select visitor_id
       from identities
      where tenant_id = $1 and site_id = $2 and user_id = $3`,
    [tenantId, siteId, userId],
  );
  return rows.map((r) => r.visitor_id);
}
