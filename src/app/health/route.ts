import { query } from "@/lib/db/pool";

// Liveness/readiness probe. The publishing pipeline hits this after deploy.
export const dynamic = "force-dynamic";

export async function GET() {
  // Report DB reachability without failing the probe hard — the pipeline's
  // deploy-status poll wants a 200 once the container is up; a detailed `db`
  // flag helps diagnose a bad DATABASE_URL without crashing the app.
  let db = false;
  try {
    await query("select 1");
    db = true;
  } catch {
    db = false;
  }
  return Response.json({ ok: true, service: "analytics", db });
}
