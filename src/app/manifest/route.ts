import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the plugin manifest at GET /manifest — the platform reads this during
 * registration (POST /api/v1/tools/plugins/register/) and the publishing
 * pipeline's rehost step. Source of truth is manifest.json at the repo root.
 *
 * Note: this is the EESA plugin manifest, distinct from Next's PWA
 * `app/manifest.ts` metadata convention (which we don't use).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await readFile(path.join(process.cwd(), "manifest.json"), "utf8");
    return new Response(raw, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ error: "manifest unavailable" }, { status: 500 });
  }
}
