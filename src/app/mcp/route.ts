import { verify, requireGateway, AuthError, type PluginContext } from "@/lib/eesa/auth";
import { listSites, type Site } from "@/lib/db/sites";
import { loadEvents } from "@/lib/db/load";
import { recordingIdsFor } from "@/lib/live/recordings";
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
  {
    name: "person_sessions",
    description:
      "Recorded sessions for ONE known person, newest first — what they did, "
      + "how long they stayed, whether they rage-clicked, whether it converted, "
      + "and the replay id where a recording exists. `person` is the id the "
      + "site passed to identify() (for Chups, a customer id like CUS-045). "
      + "Returns JSON. Anonymous visits are never returned: a session with no "
      + "identity belongs to nobody in particular and guessing would attribute "
      + "a stranger's browsing to a named customer.",
    inputSchema: {
      type: "object",
      properties: {
        person: {
          type: "string",
          description: "The id the site passed to identify(), e.g. CUS-045.",
        },
        site: { type: "string" },
        range: { type: "string", description: "24h, 7d, 30d, 90d. Default 30d." },
        limit: { type: "integer", description: "Max sessions. Default 25." },
      },
      required: ["person"],
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

/**
 * A machine-readable result.
 *
 * The other three tools answer an agent, so prose is right for them. This
 * one answers a SCREEN — the Customer 360 page renders the rows — and a
 * sentence would have to be parsed back apart at the other end. The payload
 * goes in both places: `structuredContent` for clients that read it, and the
 * same JSON as text for those that do not, so neither has to guess.
 */
function toolJson(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload as Record<string, unknown>,
  };
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

/**
 * Where this plugin is reachable, as the caller just reached it.
 *
 * Derived from the request rather than configured, because there is no
 * env var for it and inventing one means a replay link that is wrong on every
 * deployment where somebody forgot to set it. Behind a proxy the original host
 * is in `x-forwarded-*`; `req.url` there is the internal container address, so
 * a link built from it would open nothing from a browser.
 */
function publicOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  if (!host) return "";
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  return `${proto}://${host}`;
}

async function callTool(
  ctx: PluginContext,
  name: string,
  args: Record<string, unknown>,
  origin = "",
): Promise<ReturnType<typeof toolText>> {
  // 7 days is right for a traffic chart and wrong for a person: somebody
  // asking what a customer did is usually looking at a complaint from last
  // week, and an empty answer would read as "they never visited".
  const defaultRange = name === "person_sessions" ? "30d" : "7d";
  const range = typeof args.range === "string" ? args.range : defaultRange;
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

  if (name === "person_sessions") {
    const person = typeof args.person === "string" ? args.person.trim() : "";
    if (!person) return toolJson({ person: "", sessions: [], error: "person is required." });
    const limit = Number.isFinite(args.limit as number)
      ? Math.max(1, Math.min(100, Number(args.limit)))
      : 25;
    const recIds = await recordingIdsFor(ctx.tenantId, site.id);
    const rows = agg.sessionsForUser(person, Date.now(), evs, recIds, limit);
    return toolJson({
      person,
      site: site.name,
      // The window is a PROPERTY OF THE ANSWER, not a footnote: the store is
      // a rolling window, so "no sessions" means "none in this range" and a
      // caller that does not know the range cannot tell that apart from
      // "this person has never visited".
      range,
      found: rows.length,
      sessions: rows.map((r) => ({
        id: r.id,
        replayId: r.replayId ?? null,
        hasRecording: !!r.hasRecording,
        // The link, built here rather than by every caller. Only offered when
        // there is something to play: a Watch button that opens the empty
        // state is worse than no button, because somebody clicks it twice and
        // then reports the player as broken.
        replayUrl: r.hasRecording && r.replayId && origin
          ? `${origin}/app/sessions/${encodeURIComponent(r.replayId)}`
          + `?site=${encodeURIComponent(site.id)}`
          : null,
        outcome: r.outcome,
        // Absolute, in epoch milliseconds. A support agent reads these beside
        // an order timestamp; "42 minutes ago" cannot answer "was this the
        // visit where they tried to pay" without knowing when it was computed.
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        startedMinutesAgo: r.startedMinutesAgo,
        durationSec: r.durationSec,
        pages: r.pages,
        events: r.events,
        rageClicks: r.rageClicks,
        device: r.device,
        browser: r.browser,
        os: r.os ?? null,
        location: r.location,
        source: r.source ?? null,
        path: r.path,
        inCart: !!r.inCart,
        completed: !!r.completed,
      })),
    });
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
        return rpcResult(id, await callTool(ctx, name, args, publicOrigin(req)));
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
