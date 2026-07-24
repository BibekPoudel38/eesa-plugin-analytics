import { requireUi } from "@/lib/eesa/api";
import { query } from "@/lib/db/pool";

/**
 * Role probe. The Eesa Apps grid (GET /me/apps on the platform) mints a
 * UI-session token and calls this to decide whether the app is visible to the
 * user and what role to show. v1 is admin-only: any authenticated tenant user
 * is provisioned as an admin member on first touch.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;

  // Upsert an admin membership on first access (idempotent).
  try {
    await query(
      `insert into members (tenant_id, user_id, role)
       values ($1, $2, 'admin')
       on conflict (tenant_id, user_id) do nothing`,
      [ctx.tenantId, ctx.sub],
    );
  } catch {
    // A DB hiccup shouldn't hide the app; fall through with the default role.
  }

  return Response.json({
    role: "admin",
    user: { id: ctx.sub, email: ctx.email ?? null },
    tenantId: ctx.tenantId,
  });
}
