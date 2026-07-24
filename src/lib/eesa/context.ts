import "server-only";
import { AuthError, verify, requireGateway, type PluginContext, type Surface } from "./auth";

/**
 * Route-handler glue: turn a Next `Request` into a verified {@link PluginContext},
 * or an error Response. Keeps the auth ceremony out of every route.
 *
 *   const ctx = await requireContext(req, { surface: "ui" });
 *   if (ctx instanceof Response) return ctx;   // 401/403 already shaped
 *   // ...tenant-scoped work with ctx.tenantId
 */
export async function requireContext(
  req: Request,
  opts: { surface?: Surface; gateway?: boolean } = {},
): Promise<PluginContext | Response> {
  try {
    if (opts.gateway) {
      requireGateway(req.headers.get("x-eesa-gateway-secret"));
    }
    return await verify(req.headers.get("authorization"), {
      expectedSurface: opts.surface,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
