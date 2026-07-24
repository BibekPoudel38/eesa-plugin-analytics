import { verify, requireGateway, AuthError, type PluginContext } from "@/lib/eesa/auth";
import { listSites, type Site } from "@/lib/db/sites";
import { loadEvents } from "@/lib/db/load";
import * as agg from "@/lib/live/aggregate";
import { computeFunnel, type FunnelStepDef } from "@/lib/live/funnel";
import { rangeDays } from "@/lib/ranges";

// MCP surface for the Eesa agent. Minimal JSON-RPC: initialize,
// notifications/initialized, tools/list, tools/call. Gateway-secret + mcp-surface
// token verified on every request; tenant scoped from the token.
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const DAY = 86_400_000;

const TOOLS = [
  {
    name: "traffic_summary",
    description:
      "Visitors, pageviews, top sources and devices for a site over a time window (e.g. last 7 days).",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Site name or id (optional if the workspace has one site)." },
        range: { type: "string", description: "Time window: 24h, 7d, 30d, 90d. Default 7d." },
      },
    },
  },
  {
    name: "top_pages",
    description: "The most-visited pages for a site over a time window, with visitors and pageviews.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string" },
        range: { type: "string" },
      },
    },
  },
  {
    name: "funnel_report",
    description:
      "Conversion + per-step drop-off for an ordered list of page steps on a site. Steps are path substrings, e.g. [\"/pricing\",\"/signup\",\"/welcome\"].",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string" },
        range: { type: "string" },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Ordered path substrings, first → last.",
        },
      },
      required: ["steps"],
    },
  },
];

function rpcResult(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}
function toolText(text: string) {
  return { content: [{ type: "text", text }] };
}

async function resolveSite(
  tenantId: string,
  siteArg: string | undefined,
): Promise<{ site: Site } | { error: string }> {
  const sites = await listSites(tenantId);
  if (!sites.length) return { error: "No sites are set up for this workspace yet." };
  if (!siteArg) {
    if (sites.length === 1) return { site: sites[0] };
    return {
      error:
        "Multiple sites exist — specify one: " +
        sites.map((s) => s.name).join(", "),
    };
  }
  const needle = siteArg.toLowerCase();
  const site =
    sites.find((s) => s.id === siteArg) ??
    sites.find((s) => s.name.toLowerCase() === needle) ??
    sites.find((s) => s.domain.toLowerCase() === needle);
  if (!site) return { error: `No site matches "${siteArg}".` };
  return { site };
}

async function callTool(
  ctx: PluginContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ReturnType<typeof toolText>> {
  const range = typeof args.range === "string" ? args.range : "7d";
  const siteArg = typeof args.site === "string" ? args.site : undefined;
  const resolved = await resolveSite(ctx.tenantId, siteArg);
  if ("error" in resolved) return toolText(resolved.error);
  const site = resolved.site;
  const since = Date.now() - rangeDays(range) * DAY;
  const evs = await loadEvents(ctx.tenantId, site.id, since);

  if (name === "traffic_summary") {
    const kpis = agg.liveKpis(Date.now(), evs);
    const sources = agg.liveSources(evs);
    const devices = agg.liveDevices(evs);
    const kv = (k: string) => kpis.find((x) => x.key === k)?.value ?? 0;
    return toolText(
      [
        `Traffic for ${site.name} (${range}):`,
        `• Visitors: ${kv("users")}`,
        `• Sessions: ${kv("sessions")}`,
        `• Bounce: ${kv("bounce")}%`,
        `• Top sources: ${sources.slice(0, 5).map((s) => `${s.name} (${s.value})`).join(", ") || "—"}`,
        `• Devices: ${devices.map((d) => `${d.name} ${d.value}%`).join(", ")}`,
      ].join("\n"),
    );
  }

  if (name === "top_pages") {
    const pages = agg.liveTopPages(evs).slice(0, 10);
    if (!pages.length) return toolText(`No page views for ${site.name} in ${range}.`);
    return toolText(
      `Top pages for ${site.name} (${range}):\n` +
        pages
          .map((p, i) => `${i + 1}. ${p.path} — ${p.views} views, ${p.bounce}% bounce`)
          .join("\n"),
    );
  }

  if (name === "funnel_report") {
    const raw = Array.isArray(args.steps) ? (args.steps as unknown[]) : [];
    const steps: FunnelStepDef[] = raw
      .filter((s): s is string => typeof s === "string")
      .map((s) => ({ label: s, match: s }));
    if (!steps.length) return toolText("Provide an ordered list of page steps.");
    const f = computeFunnel(evs, steps);
    return toolText(
      `Funnel for ${site.name} (${range}) — ${f.total} sessions entered:\n` +
        f.steps
          .map(
            (s) =>
              `• ${s.label}: ${s.sessions} sessions (${Math.round(s.rate * 100)}%)`,
          )
          .join("\n"),
    );
  }

  return toolText(`Unknown tool: ${name}`);
}

export async function POST(req: Request) {
  // Auth: gateway secret + mcp-surface service token.
  let ctx: PluginContext;
  try {
    requireGateway(req.headers.get("x-eesa-gateway-secret"));
    ctx = await verify(req.headers.get("authorization"), { expectedSurface: "mcp" });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return Response.json({ error: (e as Error).message }, { status });
  }

  let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "analytics", version: "0.1.0" },
      });
    case "notifications/initialized":
      return new Response(null, { status: 204 });
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name as string | undefined;
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      if (!name) return rpcError(id, -32602, "Missing tool name");
      try {
        return rpcResult(id, await callTool(ctx, name, args));
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Tool error: ${(e as Error).message}` }],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
