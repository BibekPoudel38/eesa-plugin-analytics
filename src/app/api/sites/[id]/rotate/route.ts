import { requireUi } from "@/lib/eesa/api";
import { rotateTrackingKey } from "@/lib/db/sites";

// Rotate a site's public tracking key. The old key stops resolving immediately;
// the install snippet must be re-pasted with the new key.
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireUi(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const site = await rotateTrackingKey(ctx.tenantId, id);
  if (!site) return Response.json({ error: "site not found" }, { status: 404 });
  return Response.json({ site });
}
