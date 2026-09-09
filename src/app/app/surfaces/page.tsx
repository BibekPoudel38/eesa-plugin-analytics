import { Smartphone, Monitor, TriangleAlert } from "lucide-react";

import { PageHeader, Eyebrow, DeltaPill } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { RangeTabs } from "@/components/app/range-filter";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { DataBadge } from "@/components/app/data-badge";
import { NoSite } from "@/components/app/no-site";
import { getAppData } from "@/lib/data";
import { compactNumber, duration, relativeTime } from "@/lib/format";
import { axisLabels } from "@/lib/ranges";
import { currentScope } from "@/lib/eesa/scope";

export const dynamic = "force-dynamic";

/**
 * The mobile app, on its own.
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

function ago(ms: number | null): string {
  if (!ms) return "never";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function Compare({
  label,
  icon: Icon,
  totals,
  accent,
}: {
  label: string;
  icon: typeof Smartphone;
  totals: { events: number; visitors: number; sessions: number; identified: number };
  accent: string;
}) {
  // People who have identified, over people. Both halves are visitors, so the
  // percentage is of something real — and the counts are shown beneath it so
  // nobody has to take the ratio on trust.
  const signedIn = totals.visitors
    ? Math.round((totals.identified / totals.visitors) * 100)
    : 0;
  return (
    <div className="flex-1 space-y-3 p-5">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4" style={{ color: accent }} />
        {label}
      </span>
      <div className="grid grid-cols-4 gap-3">
        <div>
          <Eyebrow>Events</Eyebrow>
          <p className="tabular font-display text-lg font-bold">
            {compactNumber(totals.events)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">screens &amp; taps</p>
        </div>
        <div>
          <Eyebrow>Sessions</Eyebrow>
          <p className="tabular font-display text-lg font-bold">
            {compactNumber(totals.sessions)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">visits</p>
        </div>
        <div>
          <Eyebrow>Visitors</Eyebrow>
          <p className="tabular font-display text-lg font-bold">
            {compactNumber(totals.visitors)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">people</p>
        </div>
        <div>
          <Eyebrow>Signed in</Eyebrow>
          <p className="tabular font-display text-lg font-bold">{signedIn}%</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {compactNumber(totals.identified)} of {compactNumber(totals.visitors)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function AppSurfacePage({
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
        title="Web &amp; app"
        description="The app and the website share one tracking key, so the funnel stays whole. This is the only page that separates them again."
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

      {/* Side by side, because the number that matters is the ratio. A count
          of app events means little until you can see it against the web. */}
      <Panel>
        <PanelHead
          title="App against website"
          sub="Same key, same customers, separated only here"
          right={<RangeTabs />}
        />
        <div className="flex flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0">
          <Compare label="Mobile app" icon={Smartphone} totals={d.app} accent="var(--ember)" />
          <Compare label="Website" icon={Monitor} totals={d.web} accent="var(--teal)" />
        </div>
      </Panel>

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
                sub="People, not events — one phone opened forty times is one phone"
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
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHead
                title="Screens"
                sub="Where people go — from analytics.screen()"
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
                    No screens recorded. The app reports these with
                    analytics.screen(route.name).
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHead
                title="Taps"
                sub="What people do — from analytics.click()"
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
                    No taps recorded yet. The app reports these with
                    analytics.click(&quot;add_to_cart&quot;).
                  </p>
                )}
              </div>
            </Panel>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-5">
              <PanelHead
                title="Where the app is used"
                sub="People, by the place the request came from"
              />
              <div className="p-5">
                {d.locations.length ? (
                  <BarList
                    items={d.locations.map((l) => ({
                      label: l.name,
                      value: l.value,
                      color: l.color,
                    }))}
                    valueFormatter={compactNumber}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No location reported yet.
                  </p>
                )}
              </div>
            </Panel>

            <Panel className="lg:col-span-7">
              <PanelHead
                title="Latest in the app"
                sub="The most recent screens and taps, newest first"
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
