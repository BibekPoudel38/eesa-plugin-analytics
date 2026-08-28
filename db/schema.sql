-- Eesa Analytics plugin — Postgres/TimescaleDB schema.
--
-- Tenant isolation is app-level, exactly like eesa-plugin-documents: every row
-- carries tenant_id (the Eesa tenant id from the verified JWT `tenantId` claim,
-- NEVER a client input). Every query is scoped by it.
--
-- Two planes write here (see EESA_ANALYTICS_PLUGIN_DESIGN.md §2):
--   • Authed dashboard/agent — tenant_id from the Eesa JWT.
--   • Public ingest — tenant_id + site_id resolved from a site's tracking_key,
--     which was itself minted in the authed plane and is bound to a tenant.
--
-- Apply:  psql "$DATABASE_URL" -f db/schema.sql   (idempotent — safe to re-run)
-- Requires the timescaledb extension available on the server.

create extension if not exists pgcrypto;
create extension if not exists timescaledb;

-- ---------------------------------------------------------------------------
-- Sites — one row per tracked website/property ("add multiple servers").
-- The tracking_key is the PUBLIC, unguessable value that goes in the snippet's
-- data-site attribute; the public ingest endpoints resolve it to (tenant, site).
-- ---------------------------------------------------------------------------
create table if not exists sites (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       text not null,
    name            text not null default '',
    domain          text not null default '',        -- display/canonical host
    tracking_key    text not null unique,            -- public write key (e.g. eak_live_…)
    allowed_origins text[] not null default '{}',     -- ingest Origin allowlist; empty = any (dev)
    record_replay   boolean not null default false,   -- rrweb off by default (privacy)
    mask_inputs     boolean not null default true,    -- when replay on, force maskAllInputs
    status          text not null default 'active',   -- active | paused | disabled
    created_by      text not null default '',         -- Eesa user id (token sub)
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists sites_tenant_idx on sites (tenant_id);
-- Fast public-ingest lookup: key → active site.
create index if not exists sites_key_active_idx on sites (tracking_key) where status = 'active';

-- ---------------------------------------------------------------------------
-- Events — the analytics firehose. Timescale hypertable, partitioned by ts.
-- One row per captured event; siteId/visitorId/etc are denormalised on for
-- fast group-bys. Raw rows age out (retention policy below); continuous
-- aggregates keep the long-term rollups.
-- ---------------------------------------------------------------------------
create table if not exists events (
    tenant_id   text        not null,
    site_id     uuid        not null,
    ts          timestamptz not null,               -- server receive time (authoritative)
    client_ts   timestamptz,                         -- browser-reported time (best effort)
    type        text        not null,               -- pageview|click|rageclick|deadclick|scroll|custom|session_end
    path        text        not null default '',
    visitor_id  text        not null default '',
    session_id  text        not null default '',
    referrer    text        not null default '',
    source      text        not null default '',    -- derived channel (direct/referral/…)
    device      text        not null default '',    -- Desktop|Mobile|Tablet
    browser     text        not null default '',
    os          text        not null default '',
    country     text        not null default '',    -- geo-enriched at ingest ("CC")
    city        text        not null default '',
    x           real,                                 -- click x, viewport-normalised 0..1
    y           real,                                 -- click y, document-normalised 0..1
    target      text,                                 -- clicked element label
    text        text,                                 -- clicked element text
    depth       smallint,                             -- max scroll depth 0..100
    name        text,                                 -- custom event name
    props       jsonb                                 -- custom event props
);
-- Hypertable on ts (7-day chunks). if_not_exists keeps this idempotent.
select create_hypertable('events', 'ts', chunk_time_interval => interval '7 days', if_not_exists => true);
-- Primary read pattern: one tenant+site over a time window.
create index if not exists events_tenant_site_ts_idx on events (tenant_id, site_id, ts desc);
create index if not exists events_tenant_site_type_ts_idx on events (tenant_id, site_id, type, ts desc);

-- Identity, stamped at ingest for events captured AFTER the site called
-- identify(). Events captured before it stay '' forever — see `identities`
-- below for how those are resolved without ever rewriting a row.
-- ALTER rather than a column in the create above: the table already exists on
-- deployed installs, where `create table if not exists` is a no-op.
alter table events add column if not exists user_id text not null default '';
-- Partial: the overwhelming majority of rows are anonymous, and indexing them
-- would double the index for no reader.
create index if not exists events_tenant_site_user_ts_idx
    on events (tenant_id, site_id, user_id, ts desc) where user_id <> '';

-- Hourly rollup powering the dashboards (visitors/pageviews per site/path/etc).
-- Continuous aggregate refreshes incrementally; dashboards read this, not raw.
create materialized view if not exists events_hourly
with (timescaledb.continuous) as
select
    tenant_id,
    site_id,
    time_bucket('1 hour', ts) as bucket,
    type,
    path,
    device,
    source,
    country,
    count(*)                          as events,
    count(distinct visitor_id)        as visitors,
    count(distinct session_id)        as sessions
from events
group by tenant_id, site_id, bucket, type, path, device, source, country
with no data;

-- Refresh policy + retention. Wrapped so a re-run doesn't error if present.
do $$
begin
    perform add_continuous_aggregate_policy('events_hourly',
        start_offset => interval '3 days',
        end_offset   => interval '1 hour',
        schedule_interval => interval '30 minutes');
exception when others then null; -- policy already exists
end $$;

do $$
begin
    -- Keep 90 days of RAW events; the hourly rollup persists beyond that.
    perform add_retention_policy('events', interval '90 days');
exception when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- Identities — the visitor→user link that makes identification RETROACTIVE.
--
-- A visitor browses anonymously, then signs in. The events already written are
-- never rewritten: they keep user_id = '' forever, exactly as captured. Instead
-- the site calls identify() once, one row lands here, and every read resolves
-- that visitor's whole history — before and after the login — to one person.
--
-- Why a mapping row and not an UPDATE on `events`:
--   • `events` is a hypertable behind a continuous aggregate. Rewriting a
--     visitor's rows on every login sprays writes across chunks, and the
--     already-materialised `events_hourly` buckets would silently disagree with
--     the raw rows underneath them.
--   • One insert covers ALL of that visitor's history at once, including rows
--     already rolled up and rows older than any backfill window would reach.
--   • It is reversible. Deleting the row un-identifies the visitor; no history
--     was destroyed to make the link, so none is destroyed to undo it.
--
-- `user_id` is the SITE's own identifier, opaque to this plugin — a Chups
-- customer id, another tenant's account id, whatever they have. We never parse
-- it, so the capability is portable to any site without knowing its schema.
--
-- One user has many visitor ids (one per device/browser); a visitor id maps to
-- at most one user, hence the primary key. Re-identifying the same visitor as a
-- different user overwrites — that is a shared device, and last-in wins.
-- ---------------------------------------------------------------------------
create table if not exists identities (
    tenant_id   text not null,
    site_id     uuid not null,
    visitor_id  text not null,
    user_id     text not null,
    first_seen  timestamptz not null default now(),  -- when this link was first made
    -- Last time this visitor's identity CHANGED, not the last identify() call:
    -- a signed-in visitor re-sends the same id on every batch, and rewriting
    -- the row each time would mean a write every few seconds per open tab.
    updated_at  timestamptz not null default now(),
    primary key (tenant_id, site_id, visitor_id)
);
-- Reverse lookup: every device a given user has been seen on.
create index if not exists identities_tenant_site_user_idx
    on identities (tenant_id, site_id, user_id);

-- ---------------------------------------------------------------------------
-- Funnels — named, ordered step definitions (steps are event/path matchers).
-- ---------------------------------------------------------------------------
create table if not exists funnels (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   text not null,
    site_id     uuid not null,
    name        text not null,
    steps       jsonb not null default '[]',        -- [{label, match:{type,path?,name?}}]
    created_by  text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (tenant_id, site_id, name)
);
create index if not exists funnels_tenant_site_idx on funnels (tenant_id, site_id);

-- ---------------------------------------------------------------------------
-- Goals — tenant-defined conversion cards.
--
-- Replaces the hardcoded English path guesses that used to decide "converted"
-- ("confirmation", "thank", "cart", "checkout", …). Those only ever worked for
-- an English e-commerce site; a burrito shop tracking /menu/burrito, or any
-- site in another language, got nothing. A goal is whatever THIS tenant says it
-- is: a free-text name plus one rule.
--
--   kind='path'   value matched against pageview paths, per `operator`
--   kind='event'  value matched against a custom event name (exact, folded)
--
-- Scoped to (tenant, site) exactly like funnels — one tenant can never see or
-- compute another's goals. The IT person who sets a site up owns these; nothing
-- here is global or hardcoded.
-- ---------------------------------------------------------------------------
create table if not exists goals (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   text not null,
    site_id     uuid not null,
    name        text not null,                       -- free text: "Burrito", "Reached checkout"
    kind        text not null default 'path',        -- path | event
    operator    text not null default 'contains',    -- contains | starts_with | exact  (path only)
    value       text not null,                       -- path fragment, or custom event name
    icon        text not null default '',            -- optional lucide icon name for the card
    position    integer not null default 0,          -- card order on the overview
    active      boolean not null default true,
    created_by  text not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (tenant_id, site_id, name)
);
create index if not exists goals_tenant_site_idx on goals (tenant_id, site_id, position);

-- ---------------------------------------------------------------------------
-- Session-replay pointers (P4). Blobs live in object storage (MinIO/S3);
-- this table only points at them so a replay can be located + retention run.
-- ---------------------------------------------------------------------------
create table if not exists recordings (
    id           uuid primary key default gen_random_uuid(),
    tenant_id    text not null,
    site_id      uuid not null,
    session_id   text not null,
    object_key   text not null,                      -- S3/MinIO key of the rrweb chunk set
    device       text not null default '',
    started_at   timestamptz not null default now(),
    duration_ms  integer not null default 0,
    size_bytes   bigint not null default 0,
    created_at   timestamptz not null default now(),
    unique (tenant_id, site_id, session_id)
);
create index if not exists recordings_tenant_site_idx on recordings (tenant_id, site_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Members — plugin-owned role membership (v1: admin only), mirrors documents.
-- The Apps grid's role probe (GET /me) reads this.
-- ---------------------------------------------------------------------------
create table if not exists members (
    tenant_id   text not null,
    user_id     text not null,                       -- Eesa user id (token sub)
    role        text not null default 'admin',       -- v1: admin only
    created_at  timestamptz not null default now(),
    primary key (tenant_id, user_id)
);
