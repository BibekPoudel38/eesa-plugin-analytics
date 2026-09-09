import Link from "next/link";
import { MapPin, TriangleAlert } from "lucide-react";

import { PageHeader, DeltaPill } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { RangeTabs } from "@/components/app/range-filter";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { DataBadge } from "@/components/app/data-badge";
import { NoSite } from "@/components/app/no-site";
import { getAppData } from "@/lib/data";
import type { AppEventKind } from "@/lib/db/app";
import { eventLabel, fieldLabel, sentence } from "@/lib/vocab";
import { compactNumber, duration, relativeTime } from "@/lib/format";
import { axisLabels } from "@/lib/ranges";
import { currentScope } from "@/lib/eesa/scope";

export const dynamic = "force-dynamic";

/**
 * The mobile app, in full.
 *
 * The app and the website report through one tracking key deliberately, so a
 * customer who browses on mobile web and orders in the app stays one person
 * rather than two strangers in two dashboards. Every other page here is better
 * for that choice.
 *
 * This page is where the bill for it is paid. Merged into one stream a broken
 * app is invisible: it stops sending into traffic that is still busy, and reads
 * as a quiet week. Nothing else in this dashboard can tell those two apart.
 */

//: The dashboard's own accents, reused so the app page does not introduce a
//: fourth palette nobody chose.
const PLATFORM_COLOR = ["var(--ember)", "var(--teal)", "var(--violet)", "var(--muted-foreground)"];

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

function ago(ms: number | null): string {
  if (!ms) return "never";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/** A one-property split — delivery vs pickup, wallet vs card. */
function Split({
  title, rows, empty, verbatim, suffix,
}: {
  title: string;
  rows: { label: string; count: number; value: number }[];
  empty: string;
  /** Coupon codes are literals people type — never re-case them. */
  verbatim?: boolean;
  suffix?: (r: { label: string; count: number; value: number }) => string;
}) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">
                {verbatim ? r.label : sentence(r.label)}
              </span>
              <span className="shrink-0 tabular text-muted-foreground">
                {suffix?.(r) || `${Math.round((r.count / (total || 1)) * 100)}%`}
                <span className="ml-2 text-xs">{compactNumber(r.count)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        empty && <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

/**
 * What the app sends, reported rather than interpreted.
 *
 * The coverage figure beside each property is the reason this exists: a field
 * present on 106 of 106 events is one you can build on, and the same field on
 * 12 of 106 is a client that quietly stopped setting it. Every other panel on
 * this page would keep averaging the 12 without ever saying so.
 */
function EventContract({ kinds }: { kinds: AppEventKind[] }) {
  if (!kinds.length) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        The app has recorded no actions in this window — no baskets, no
        checkouts, no orders.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className={TH}>What happened</th>
            <th className={`${TH} text-right`}>Times</th>
            <th className={TH}>Detail recorded with it</th>
            <th className={`${TH} text-right`}>Last one</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {kinds.map((k) => (
            <tr key={k.name} className="align-top hover:bg-muted/30">
              <td className="px-3 py-3">
                <div className="font-medium text-foreground">{eventLabel(k.name)}</div>
                {/* Kept, but demoted. Whoever is checking the integration
                    still needs it; nobody reading the numbers does. */}
                <div className="font-mono text-[11px] text-muted-foreground">{k.name}</div>
              </td>
              <td className="px-3 py-3 text-right tabular text-foreground">
                {compactNumber(k.count)}
              </td>
              <td className="px-3 py-3">
                {k.props.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {k.props.map((p) => {
                      const partial = p.count < k.count;
                      return (
                        <span
                          key={p.key}
                          title={`${p.key} — on ${p.count} of ${k.count} · e.g. ${p.sample}`}
                          className={`inline-flex items-baseline gap-1.5 rounded-md border px-1.5 py-0.5 text-xs ${
                            partial
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "bg-muted/60 text-muted-foreground"
                          }`}
                        >
                          <span className="text-foreground">{fieldLabel(p.key)}</span>
                          {partial && (
                            <span className="tabular">
                              {Math.round((p.count / k.count) * 100)}%
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    no properties
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                {ago(k.lastSeen ? Date.parse(k.lastSeen) : null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MobileAppPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const scope = await currentScope();
  if (!scope.authed || !scope.site) return <NoSite />;
  const { range } = await searchParams;

  const d = await getAppData(scope.tenantId, scope.site.id, range);
  const labels = axisLabels(range);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Mobile app"
        title="App"
        description="Everything the Chups app reports — screens, taps, people and where they are. Web &amp; app compares it against the website."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              app last reported {ago(d.lastSeen)}
            </span>
            <DataBadge live={d.hasApp} eventCount={d.app.events} />
          </div>
        }
      />

      {!d.hasApp && (
        // The state that looks healthiest of all, and the reason this page
        // exists: a wrong key is answered 202 {"ok":true,"accepted":0},
        // indistinguishable from success, so a live website proves nothing.
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Nothing from the mobile app in this window.</strong>{" "}
            {d.hasWeb
              ? "The website is reporting, so the tracking key is valid — but no app events have arrived. Check the app calls analytics.init with the same key: a wrong one is accepted with a success response and silently collects nothing."
              : "Neither surface has reported, so this may simply be a quiet window."}
          </p>
        </div>
      )}

      {d.hasApp && (
        <>
          {/* Two of the shared KPIs do not survive the trip to an app, and a
              card that cannot be true is worse than one that is missing.

              "Conversions" counts sessions containing any custom event — on a
              website that is a checkout, but every analytics.click() the app
              reports is a custom event, so it would read as a conversion rate
              when it means "somebody tapped something". The Taps panel below
              says that honestly instead.

              "Rage clicks" is never emitted by the mobile client at all, so it
              is a card permanently pinned to zero. */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {d.kpis
              .filter((k) => k.key !== "conversion" && k.key !== "rage")
              .map((k) => (
                <KpiCard key={k.key} kpi={k} />
              ))}
          </div>

          {/* What the app reports that a website tracker never would. Every
              figure below comes from a property the client already attaches to
              its own events — nothing here was read until now. */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Revenue", value: money(d.commerce.revenue), sub: `${compactNumber(d.commerce.orders)} orders placed` },
              { label: "Average order", value: d.commerce.orders ? money(d.commerce.revenue / d.commerce.orders) : "—", sub: d.commerce.avgItems ? `${d.commerce.avgItems.toFixed(1)} items \u00b7 ${compactNumber(d.commerce.buyers)} bought` : `${compactNumber(d.commerce.buyers)} people bought` },
              { label: "Items added", value: compactNumber(d.commerce.itemsAdded), sub: `across ${compactNumber(d.commerce.cartedSessions)} baskets` },
              { label: "Discounts", value: d.commerce.discount ? money(d.commerce.discount) : "—", sub: `${compactNumber(d.commerce.coupons)} coupons applied` },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular text-foreground">{t.value}</p>
                <p className="text-xs text-muted-foreground">{t.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-8">
              <PanelHead title="App traffic" sub="Screens opened vs. people" />
              <div className="p-5">
                <AreaChart
                  data={d.trend.sessions}
                  data2={d.trend.users}
                  ariaLabel="App screens opened and people, over the selected range"
                />
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                  {labels.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel className="lg:col-span-4">
              <PanelHead
                title="Platform"
                sub="People, not visits — one phone opened forty times is one person"
              />
              <div className="p-5">
                {d.platforms.length ? (
                  <Donut
                    slices={d.platforms.map((p, i) => ({
                      name: p.name,
                      value: p.value,
                      color: PLATFORM_COLOR[i % PLATFORM_COLOR.length],
                    }))}
                    centerTop={compactNumber(d.app.visitors)}
                    centerBottom="people"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No platform reported yet.
                  </p>
                )}
                {d.devices.length > 1 && (
                  // Phone vs tablet. Reported on every app event since the
                  // first one, and shown nowhere until now.
                  <p className="mt-4 border-t pt-3 text-center text-xs text-muted-foreground">
                    {d.devices
                      .map((x) => `${compactNumber(x.value)} on ${x.name.toLowerCase()}`)
                      .join(" \u00b7 ")}
                  </p>
                )}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHead
                title="Screens"
                sub="The screens people open, busiest first"
              />
              <div className="p-5">
                {d.screens.length ? (
                  <BarList
                    items={d.screens.slice(0, 8).map((p) => ({
                      label: p.path,
                      value: p.views,
                      sub: p.avgTime ? duration(p.avgTime) : undefined,
                    }))}
                    valueFormatter={compactNumber}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No screens opened in this window.
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Actions"
                sub="What people tap, and how it has moved"
              />
              <div className="p-5">
                {d.taps.length ? (
                  <ul className="space-y-2.5">
                    {d.taps.slice(0, 8).map((t) => (
                      <li
                        key={t.name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="truncate font-medium text-foreground">
                          {t.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                          <span className="tabular">
                            {compactNumber(t.count)}
                          </span>
                          <DeltaPill delta={t.delta} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing tapped in this window.
                  </p>
                )}
              </div>
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Panel>
              <PanelHead
                title="Basket to order"
                sub="How many visits got to each step"
              />
              <div className="space-y-3 p-5">
                {[
                  { label: "Added to basket", n: d.commerce.cartedSessions },
                  { label: "Started payment", n: d.commerce.paymentSessions },
                  { label: "Placed the order", n: d.commerce.orderedSessions },
                ].map((step) => {
                  const top = d.commerce.cartedSessions || 1;
                  return (
                    <div key={step.label}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-foreground">{step.label}</span>
                        <span className="tabular text-muted-foreground">
                          {compactNumber(step.n)}
                          <span className="ml-2 text-xs">
                            {Math.round((step.n / top) * 100)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[var(--ember)]"
                          style={{ width: `${Math.min((step.n / top) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!d.commerce.cartedSessions && (
                  <p className="text-sm text-muted-foreground">
                    No baskets in this window.
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHead title="Menu" sub="What goes in the basket, most often first" />
              <div className="p-5">
                {d.items.length ? (
                  <BarList
                    items={d.items.slice(0, 8).map((i) => ({
                      label: i.name,
                      value: i.adds,
                      sub: i.price ? money(i.price) : undefined,
                    }))}
                    valueFormatter={compactNumber}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nothing added to a basket in this window.
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHead title="How they order" sub="Delivery or pickup, and how they paid" />
              <div className="space-y-4 p-5">
                <Split title="Delivery or pickup" rows={d.service} empty="No service type reported." />
                <Split title="Paid with" rows={d.payment} empty="No payment method reported." />
                {d.coupons.length > 0 && (
                  <Split
                    title="Coupons used"
                    rows={d.coupons}
                    empty=""
                    verbatim
                    suffix={(r) => (r.value ? `−${money(r.value)}` : "no discount")}
                  />
                )}
              </div>
            </Panel>
          </div>

          <Panel className="overflow-hidden">
            <PanelHead
              title="What the app records"
              sub="Every action the app reports back, how often it happened, and the detail that comes with it"
            />
            <EventContract kinds={d.kinds} />
            <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
              Screens opened are counted separately —{" "}
              {compactNumber(d.app.events - d.kinds.reduce((a, k) => a + k.count, 0))} of
              them in this window, listed under Screens above. A detail marked
              amber only arrived with some of those actions, not all of them,
              which usually means the app stopped filling it in.
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-5">
              <PanelHead
                title="Where the app is used"
                sub="The app does not report this — see People"
              />
              <div className="flex gap-3 p-5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <p>
                  The app does not report where anyone is, so this could only
                  ever say &quot;Unknown&quot; — for everybody, everywhere. The{" "}
                  <Link href="/app/people" className="font-medium text-foreground underline underline-offset-2">
                    People
                  </Link>{" "}
                  page shows where your signed-in customers live instead, from
                  your own customer records.
                </p>
              </div>
            </Panel>

            <Panel className="lg:col-span-7">
              <PanelHead
                title="Latest in the app"
                sub="The most recent activity, newest first"
              />
              <div className="divide-y">
                {d.activity.length ? (
                  d.activity.slice(0, 10).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-foreground">{a.user}</span>{" "}
                        <span className="text-muted-foreground">{a.action}</span>{" "}
                        <span className="text-foreground">{a.target}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(a.minutesAgo)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">
                    Nothing recorded in this window.
                  </p>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
