import { requireSite } from "@/lib/eesa/api";
import { getRecording } from "@/lib/live/recordings";

/**
 * The rrweb event stream for one session, consumed by the player.
 *
 * THIS ROUTE HAD NO AUTHENTICATION. It took a session id straight off the URL
 * and returned whatever the store held, while every sibling data route
 * (/api/data/session/[id] and friends) went through `requireSite`. Nobody had
 * noticed because the ingest never stored anything, so there was never a
 * recording to leak — the moment storage was switched on, this would have
 * served any tenant's screen recording to anyone who could guess a session id.
 *
 * Now: `requireSite` verifies the Eesa UI token, resolves `?site=`, and 404s a
 * site the caller's tenant does not own. The scope is then part of the lookup
 * key itself, so a valid session id from another tenant resolves to nothing
 * rather than relying on a comparison someone could forget to write.
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await requireSite(req);
  if (scope instanceof Response) return scope;

  const rec = await getRecording(scope.ctx.tenantId, scope.site.id, id);
  if (!rec) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  // Events arrive here already in playable order — chunks race, so the store
  // sorts by the events' own timestamps in lib/live/recording-codec.ts. Doing
  // it again here would be a second, drifting copy of a rule rrweb is strict
  // about (Meta and FullSnapshot first, or the Replayer renders a blank frame).
  return Response.json({
    sessionId: rec.sessionId,
    device: rec.device,
    page: rec.page,
    firstTs: rec.firstTs,
    lastTs: rec.lastTs,
    events: rec.events,
  });
}
