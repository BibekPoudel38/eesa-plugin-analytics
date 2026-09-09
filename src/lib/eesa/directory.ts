import "server-only";

/**
 * Turning a customer id into a person.
 *
 * The tracked app calls `identify("CUS-6931")`, and that opaque string is all
 * the ingest ever sees. It is not an oversight: `/api/collect` is a PUBLIC
 * endpoint, so a name or a phone number sent through it would be a name or a
 * phone number anyone could send, and this database would become a customer
 * list with no access control in front of it.
 *
 * The names stay in the tenant's own database. This asks Eesa to decorate the
 * ids we already hold, server-to-server with the shared gateway secret.
 *
 * Every failure returns an empty map rather than throwing. A page that lists
 * people must render when the directory is unreachable — the ids are still
 * true, and a dashboard that 500s because a name was missing would be a worse
 * outcome than one that shows the id. The backend records the attempt, so the
 * silence here is not the only trace.
 */

export interface Customer {
  name: string;
  phone: string;
  email: string;
  city: string;
  status: string;
  since: string;
}

/** Matches the backend's MAX_IDS; asking for more just drops the tail. */
const MAX_IDS = 500;
const TIMEOUT_MS = 4_000;

export async function resolveCustomers(
  tenantId: string,
  ids: string[],
): Promise<Record<string, Customer>> {
  const wanted = [...new Set(ids.filter(Boolean))].slice(0, MAX_IDS);
  if (!wanted.length) return {};

  const base = (process.env.EESA_API_BASE || "").replace(/\/+$/, "");
  const secret = process.env.PLUGIN_GATEWAY_SECRET || "";
  // Not configured is not an error — it is a deployment without a directory.
  if (!base || !secret) return {};

  try {
    const res = await fetch(`${base}/gateway/customer-lookup/`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-eesa-gateway-secret": secret,
      },
      body: JSON.stringify({ tenant: tenantId, ids: wanted }),
      // The directory is a nicety on top of data we already have. It must never
      // be the reason a page hangs.
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { customers?: Record<string, Customer> };
    return body.customers ?? {};
  } catch {
    return {};
  }
}
