import "server-only";
import { query } from "./pool";

/**
 * What the mobile app reports, asked of the database rather than counted in JS.
 *
 * The app's own client sends a deliberately narrow set of fields — no clicks,
 * no scroll depth, no referrer, no geo — so most of this dashboard's shared
 * machinery has nothing to work with. What it DOES send, and what nothing was
 * reading until now, is commerce: every `add_to_cart`, `payment_started`,
 * `place_order` and `apply_coupon` arrives with its properties attached.
 *
 * These are aggregates because the alternative is loading twenty thousand rows
 * to add up eighty of them.
 */

/** The app's own events, in one window. Every query here shares this filter. */
const SCOPE = `tenant_id = $1 and site_id = $2 and ts >= $3 and display_mode = 'app'`;

/**
 * A numeric property, or NULL.
 *
 * `(props->>'total')::numeric` throws on the first row where a client sent
 * something that is not a number, and one such row would take out the whole
 * page rather than one figure. The regex makes a bad value absent instead.
 */
function num(key: string): string {
  return `(case when props->>'${key}' ~ '^-?[0-9]+(\\.[0-9]+)?$'
                then (props->>'${key}')::numeric end)`;
}

export interface AppPerson {
  userId: string;
  sessions: number;
  screens: number;
  carted: number;
  orders: number;
  spend: number;
  firstSeen: string;
  lastSeen: string;
  platform: string;
  /** What they add most — the app sends item_name on every add_to_cart. */
  topItem: string;
  /** Delivery or pickup, whichever they choose more often. */
  service: string;
}

/**
 * Everyone who has identified in the app, with what they did.
 *
 * `user_id` is the app's own customer id and the only thing about a person the
 * ingest ever sees — turning it into a name happens elsewhere, against the
 * tenant's own database. See `lib/eesa/directory`.
 */
export async function loadAppPeople(
  tenantId: string, siteId: string, sinceMs: number, limit = 500,
): Promise<AppPerson[]> {
  const rows = await query<Record<string, string | Date | null>>(
    `select user_id,
            count(distinct session_id)                     as sessions,
            count(*) filter (where type = 'pageview')      as screens,
            count(*) filter (where name = 'add_to_cart')   as carted,
            count(*) filter (where name = 'place_order')   as orders,
            coalesce(sum(${num("total")}) filter (where name = 'place_order'), 0) as spend,
            min(ts) as first_seen, max(ts) as last_seen,
            -- One person is one phone in practice; mode() picks the platform
            -- they actually use rather than whichever row sorted first.
            mode() within group (order by os) as platform,
            -- The two things a restaurant would actually act on, and both ride
            -- on events the app already sends.
            mode() within group (order by props->>'item_name')
              filter (where name = 'add_to_cart'
                        and coalesce(props->>'item_name', '') <> '') as top_item,
            mode() within group (order by props->>'service_type')
              filter (where coalesce(props->>'service_type', '') <> '') as service
       from events
      where ${SCOPE} and user_id <> ''
      group by 1
      order by spend desc, last_seen desc
      limit $4`,
    [tenantId, siteId, new Date(sinceMs), limit],
  );
  return rows.map((r) => ({
    userId: String(r.user_id ?? ""),
    sessions: Number(r.sessions ?? 0),
    screens: Number(r.screens ?? 0),
    carted: Number(r.carted ?? 0),
    orders: Number(r.orders ?? 0),
    spend: Number(r.spend ?? 0),
    firstSeen: r.first_seen ? new Date(r.first_seen as Date).toISOString() : "",
    lastSeen: r.last_seen ? new Date(r.last_seen as Date).toISOString() : "",
    platform: String(r.platform ?? ""),
    topItem: String(r.top_item ?? ""),
    service: String(r.service ?? ""),
  }));
}

export interface AppCommerce {
  orders: number;
  revenue: number;
  /** Sessions that reached each step. The app's real funnel. */
  cartedSessions: number;
  paymentSessions: number;
  orderedSessions: number;
  coupons: number;
  discount: number;
  itemsAdded: number;
  buyers: number;
  /** Items per order, from the item_count the app attaches to place_order. */
  avgItems: number;
}

/** The headline commerce figures, in one pass. */
export async function loadAppCommerce(
  tenantId: string, siteId: string, sinceMs: number,
): Promise<AppCommerce> {
  const [r] = await query<Record<string, string | null>>(
    `select count(*) filter (where name = 'place_order')                      as orders,
            coalesce(sum(${num("total")}) filter (where name = 'place_order'), 0) as revenue,
            count(distinct session_id) filter (where name = 'add_to_cart')    as carted_sessions,
            count(distinct session_id) filter (where name = 'payment_started') as payment_sessions,
            count(distinct session_id) filter (where name = 'place_order')    as ordered_sessions,
            count(*) filter (where name = 'apply_coupon')                     as coupons,
            coalesce(sum(${num("discount_amount")}) filter (where name = 'apply_coupon'), 0) as discount,
            coalesce(sum(${num("quantity")}) filter (where name = 'add_to_cart'), 0) as items_added,
            avg(${num("item_count")}) filter (where name = 'place_order')      as avg_items,
            count(distinct user_id) filter (where name = 'place_order' and user_id <> '') as buyers
       from events where ${SCOPE}`,
    [tenantId, siteId, new Date(sinceMs)],
  );
  return {
    orders: Number(r?.orders ?? 0),
    revenue: Number(r?.revenue ?? 0),
    cartedSessions: Number(r?.carted_sessions ?? 0),
    paymentSessions: Number(r?.payment_sessions ?? 0),
    orderedSessions: Number(r?.ordered_sessions ?? 0),
    coupons: Number(r?.coupons ?? 0),
    discount: Number(r?.discount ?? 0),
    itemsAdded: Number(r?.items_added ?? 0),
    buyers: Number(r?.buyers ?? 0),
    avgItems: Number(r?.avg_items ?? 0),
  };
}

export interface AppItem {
  name: string;
  adds: number;
  qty: number;
  price: number;
}

/** What people put in the basket — the menu, ranked by the app's own data. */
export async function loadAppItems(
  tenantId: string, siteId: string, sinceMs: number, limit = 12,
): Promise<AppItem[]> {
  const rows = await query<Record<string, string | null>>(
    `select props->>'item_name'                       as item,
            count(*)                                  as adds,
            coalesce(sum(${num("quantity")}), 0)      as qty,
            round(coalesce(avg(${num("unit_price")}), 0), 2) as price
       from events
      where ${SCOPE} and name = 'add_to_cart'
        and coalesce(props->>'item_name', '') <> ''
      group by 1 order by adds desc, qty desc limit $4`,
    [tenantId, siteId, new Date(sinceMs), limit],
  );
  return rows.map((r) => ({
    name: String(r.item ?? ""),
    adds: Number(r.adds ?? 0),
    qty: Number(r.qty ?? 0),
    price: Number(r.price ?? 0),
  }));
}

export interface AppBreakdown {
  label: string;
  count: number;
  value: number;
}

/**
 * How a single property splits — delivery vs pickup, wallet vs card, which
 * coupon codes. One shaped query rather than three near-identical ones.
 *
 * `key` is interpolated, so it is restricted to a literal union: the value can
 * never come from a request.
 */
export async function loadAppBreakdown(
  tenantId: string, siteId: string, sinceMs: number,
  key: "service_type" | "payment_kind" | "code",
  opts: { event?: string; sum?: "total" | "discount_amount"; limit?: number } = {},
): Promise<AppBreakdown[]> {
  const { event, sum, limit = 10 } = opts;
  const params: unknown[] = [tenantId, siteId, new Date(sinceMs), limit];
  if (event) params.push(event);
  const rows = await query<Record<string, string | null>>(
    `select props->>'${key}' as label, count(*) as n,
            ${sum ? `coalesce(sum(${num(sum)}), 0)` : "0"} as v
       from events
      where ${SCOPE} and coalesce(props->>'${key}', '') <> ''
        ${event ? "and name = $5" : ""}
      group by 1 order by n desc limit $4`,
    params,
  );
  return rows.map((r) => ({
    label: String(r.label ?? ""),
    count: Number(r.n ?? 0),
    value: Number(r.v ?? 0),
  }));
}

export interface AppEventProp {
  key: string;
  /** How many of this event's rows actually carried the property. */
  count: number;
  /** The most common value, for reading what the field means at a glance. */
  sample: string;
}

export interface AppEventKind {
  name: string;
  count: number;
  lastSeen: string;
  props: AppEventProp[];
}

/**
 * What the app actually sends, as opposed to what it is documented to send.
 *
 * Every other panel here interprets the app's events. This one just reports
 * them: each custom event, how many arrived, and which properties rode along
 * with how many of them. It is the only place that answers "is the client
 * sending what we think it is" without opening a database.
 *
 * The coverage number is the point. `payment_kind` on 106 of 106
 * `payment_started` events is a field that is always there; the same field on
 * 12 of 106 is a client that stopped setting it, and no aggregate built on top
 * of that field would ever say so.
 */
export async function loadAppEventKinds(
  tenantId: string, siteId: string, sinceMs: number,
): Promise<AppEventKind[]> {
  const rows = await query<Record<string, string | Date | null | AppEventProp[]>>(
    `with ev as (
        select name, ts,
               -- A client is free to send a scalar or an array here; expanding
               -- one as an object would abort the whole query.
               case when jsonb_typeof(props) = 'object' then props
                    else '{}'::jsonb end as props
          from events
         where ${SCOPE} and coalesce(name, '') <> ''
     ),
     counts as (
        select name, count(*) as n, max(ts) as last_seen from ev group by 1
     ),
     keys as (
        select e.name, kv.key,
               count(*) as n,
               mode() within group (order by left(kv.value, 40)) as sample
          from ev e, lateral jsonb_each_text(e.props) kv
         group by 1, 2
     )
     select c.name, c.n, c.last_seen,
            coalesce(
              json_agg(json_build_object('key', k.key, 'count', k.n, 'sample', k.sample)
                       order by k.n desc, k.key)
              filter (where k.key is not null), '[]') as props
       from counts c left join keys k on k.name = c.name
      group by c.name, c.n, c.last_seen
      order by c.n desc`,
    [tenantId, siteId, new Date(sinceMs)],
  );
  return rows.map((r) => ({
    name: String(r.name ?? ""),
    count: Number(r.n ?? 0),
    lastSeen: r.last_seen ? new Date(r.last_seen as Date).toISOString() : "",
    props: (r.props as AppEventProp[] | null) ?? [],
  }));
}
