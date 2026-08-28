import { NextResponse } from "next/server";
import type { Batch } from "@/lib/live/types";
import { resolveTrackingKey, originAllowed } from "@/lib/db/sites";
import { insertEvents, type EventInsert } from "@/lib/db/events";
import { cleanUserId, linkIdentity } from "@/lib/db/identities";
import { splitLocation, deriveSource } from "@/lib/live/enrich";

// Public write endpoint — anonymous browsers on tracked sites. No Eesa token;
// authenticated by the site tracking key (meta.siteId). Always dynamic.
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** "City, CC" from CDN geo headers (browser can't be trusted for this). */
function geoFrom(req: Request): string {
  const h = req.headers;
  const rawCity = h.get("x-vercel-ip-city") ?? h.get("cf-ipcity") ?? "";
  const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? "";
  let city = "";
  try {
    city = rawCity ? decodeURIComponent(rawCity) : "";
  } catch {
    city = rawCity;
  }
  if (city && country) return `${city}, ${country}`;
  return city || country || "—";
}

/** The tracked-site origin: the cross-origin Origin, else the Referer's origin. */
function originFrom(req: Request): string {
  const o = req.headers.get("origin");
  if (o && o !== "null") return o;
  try {
    return new URL(req.headers.get("referer") || "").origin;
  } catch {
    return "";
  }
}

function isValid(b: unknown): b is Batch {
  if (!b || typeof b !== "object") return false;
  const batch = b as Partial<Batch>;
  return (
    !!batch.meta &&
    typeof batch.meta === "object" &&
    typeof batch.meta.siteId === "string" &&
    Array.isArray(batch.events)
  );
}

/** Accept-and-drop: never reveal whether a key/origin was valid. */
function dropped() {
  return NextResponse.json({ ok: true, accepted: 0 }, { status: 202, headers: CORS });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    // sendBeacon posts text; fetch posts JSON — handle both.
    const text = await req.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }
  if (!isValid(body)) {
    return NextResponse.json({ error: "Bad batch" }, { status: 422, headers: CORS });
  }

  const batch = body as Batch;
  if (batch.events.length > 500) batch.events = batch.events.slice(0, 500);

  // meta.siteId IS the public tracking key. Resolve → (tenant, site).
  const site = await resolveTrackingKey(batch.meta.siteId);
  if (!site) return dropped();

  const origin = originFrom(req);
  if (!originAllowed(site.allowedOrigins, origin)) return dropped();

  const { city, country } = splitLocation(geoFrom(req));
  const now = new Date();
  const referrer = batch.meta.referrer || "";
  const source = deriveSource(referrer, origin);

  // Identity. The visitor id and the user id arrive together on the same batch,
  // from the same browser — a site can only ever claim the visitor it IS. The
  // link is written before the events so that an identify() with nothing queued
  // behind it (someone who signs in and immediately closes the tab) still binds
  // this device to the person.
  const visitorId = batch.meta.visitorId || "";
  const userId = cleanUserId(batch.meta.userId);
  if (userId && visitorId) {
    try {
      await linkIdentity(site.tenantId, site.siteId, visitorId, userId);
    } catch {
      // A failed link must never cost the site its events; the next batch from
      // this visitor carries the same id and will make the link again.
    }
  }

  const rows: EventInsert[] = batch.events.map((e) => ({
    ts: now, // server receive time (authoritative)
    clientTs: typeof e.ts === "number" ? new Date(e.ts) : null,
    type: e.type,
    path: e.path || "",
    visitorId,
    sessionId: batch.meta.sessionId || "",
    userId,
    referrer,
    source,
    device: batch.meta.device || "",
    browser: batch.meta.browser || "",
    os: batch.meta.os || "",
    country,
    city,
    x: typeof e.x === "number" ? e.x : null,
    y: typeof e.y === "number" ? e.y : null,
    target: e.target ?? null,
    text: e.text ?? null,
    depth: typeof e.depth === "number" ? e.depth : null,
    name: e.name ?? null,
    props: e.props ?? null,
  }));

  let accepted = 0;
  try {
    accepted = await insertEvents(site.tenantId, site.siteId, rows);
  } catch {
    // Don't leak internals to arbitrary sites; the tracker retries via its own
    // batching. A 500 here would just spam the console of every tracked page.
    return dropped();
  }

  return NextResponse.json({ ok: true, accepted }, { status: 200, headers: CORS });
}
