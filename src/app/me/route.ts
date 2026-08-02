import { requireUi, appRoleOf } from "@/lib/eesa/api";
import { query } from "@/lib/db/pool";

/**
 * Role probe. The Eesa Apps grid (GET /me/apps on the platform) mints a
 * UI-session token and calls this to decide whether the app is visible to the
 * user and what role to show.
 *
 * Eesa is authoritative. It stamps an `appRole` claim derived from the two
 * protected positions an admin manages at Management → Analytics:
 *
 *   admin  — read the dashboards, plus manage sites and rotate tracking keys
 *   staff  — read the dashboards
 *   none   — no access; requireUi has already returned 403, so Eesa sees a
 *            non-200 and hides the app from this user's launcher and board
 *
 * When the claim is ABSENT the tenant has no roster yet, so we keep the
 * original behaviour — any authenticated tenant member is an admin. That is
 * deliberate: this app shipped without per-user access, so switching to
 * deny-by-default would have locked out every team already using it.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx; // 401, or 403 for role "none"

  const role = appRoleOf(ctx);

  // Mirror the Eesa-assigned role onto the local members row so anything
  // reading membership directly agrees with the claim. Idempotent, and an
  // UPDATE rather than DO NOTHING — a demoted user must not keep the admin
  // row they were given on first touch under the old bootstrap.
  try {
    await query(
      `insert into members (tenant_id, user_id, role)
       values ($1, $2, $3)
       on conflict (tenant_id, user_id) do update set role = excluded.role`,
      [ctx.tenantId, ctx.sub, role],
    );
  } catch {
    // A DB hiccup shouldn't hide the app; the claim is the authority anyway.
  }

  return Response.json({
    role,
    user: { id: ctx.sub, email: ctx.email ?? null },
    tenantId: ctx.tenantId,
  });
}
