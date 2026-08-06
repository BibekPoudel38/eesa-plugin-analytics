import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { PageHeader, DeltaPill } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { KebabButton } from "@/components/app/segmented";
import { RangeTabs } from "@/components/app/range-filter";
import { DataBadge } from "@/components/app/data-badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { GoalTile, NoGoals } from "@/components/dashboard/goal-tile";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { getOverview, getLiveStatus, getGoalCards } from "@/lib/data";
import { compactNumber, duration, percent, relativeTime } from "@/lib/format";
import { axisLabels } from "@/lib/ranges";
import { currentScope } from "@/lib/eesa/scope";
import { NoSite } from "@/components/app/no-site";

export const dynamic = "force-dynamic";

const deviceColors = ["var(--teal)", "var(--ember)", "var(--amber)"];

function bounceTone(v: number) {
  if (v < 30) return "var(--pine)";
  if (v < 45) return "var(--amber)";
  return "var(--ember)";
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const scope = await currentScope();
  if (!scope.site) return <NoSite />;
  const site = scope.site;
  const { live, kpis, trend, sources, topPages, devices, locations, activity } =
    await getOverview(scope.tenantId, site.id, range);
  const status = await getLiveStatus(scope.tenantId, site.id);

  // Conversion cards are whatever THIS tenant defined — see lib/goals/compute.
  // They used to be two hardcoded English path guesses ("confirmation",
  // "cart"), which measured nothing for a site that doesn't use those words.
  const goalCards = await getGoalCards(scope.tenantId, site.id, range);
  const totalSource = sources.reduce((s, x) => s + x.value, 0);
  const sessionsKpi = kpis.find((k) => k.key === "sessions");
  const totalSessions = trend.sessions.reduce((a, b) => a + b, 0);
  const peakIdx = trend.sessions.indexOf(Math.max(...trend.sessions));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={site.domain || site.name}
        title="Overview"
        description={
          status.eventCount > 0
            ? "Real-time behaviour from your tracked site."
            : "No events yet — install the snippet to start tracking."
        }
        actions={<DataBadge live={live} eventCount={status.eventCount} />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard
            key={k.key}
            kpi={k}
            href={k.key === "users" ? "/app/visitors" : undefined}
          />
        ))}
      </div>

      {/* Conversion cards — defined by this tenant, not guessed. */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Conversions</h2>
        <Link
          href="/app/goals"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-ember"
        >
          <SlidersHorizontal className="size-3.5" />
          Manage cards
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {goalCards.length === 0 ? (
          <NoGoals />
        ) : (
          goalCards.map((c, i) => <GoalTile key={c.id} card={c} index={i} />)
        )}
      </div>

      {/* trend + sources */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-8">
          <PanelHead
            title="Traffic"
            sub="Sessions vs. active users"
            right={
              <div className="flex items-center gap-2">
                <RangeTabs />
                <KebabButton />
              </div>
            }
          />
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="tabular font-display text-[2.5rem] font-bold leading-none tracking-tight text-foreground">
                  {compactNumber(totalSessions)}
                </span>
                {sessionsKpi && (
                  <DeltaPill delta={sessionsKpi.delta} goodUp={sessionsKpi.goodUp} />
                )}
                <span className="text-sm text-muted-foreground">total sessions</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-teal" />
                  Sessions
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-ember" />
                  Users
                </span>
              </div>
            </div>
            <div className="mt-6 h-[240px] w-full">
              <AreaChart
                data={trend.sessions}
                data2={trend.users}
                marker={{
                  index: peakIdx,
                  label: compactNumber(trend.sessions[peakIdx]),
                }}
                ariaLabel="Sessions and active users over the last 30 days"
              />
            </div>
            <div className="mt-2 flex justify-between px-1 font-mono text-[0.68rem] text-muted-foreground">
              {axisLabels(range).map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHead
            title="Traffic sources"
            sub={`${compactNumber(totalSource)} sessions`}
            right={<KebabButton />}
          />
          <div className="p-4">
            <BarList
              items={sources.map((s) => ({
                label: s.name,
                value: s.value,
                color: s.color,
              }))}
            />
          </div>
        </Panel>
      </div>

      {/* top pages + devices/activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-7">
          <PanelHead
            title="Top pages"
            sub="Most-visited routes"
            right={<KebabButton />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Page</th>
                  <th className="px-3 py-2.5 text-right font-medium">Views</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg. time</th>
                  <th className="px-5 py-2.5 text-right font-medium">Bounce</th>
                </tr>
              </thead>
              <tbody>
                {topPages.map((p) => (
                  <tr
                    key={p.path}
                    className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/50"
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[0.8rem] text-foreground">
                          {p.path}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {p.title}
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-mono text-[0.82rem]">
                      {compactNumber(p.views)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-mono text-[0.82rem] text-muted-foreground">
                      {duration(p.avgTime)}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: bounceTone(p.bounce) }}
                        />
                        <span className="tabular font-mono text-[0.82rem]">
                          {percent(p.bounce)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <Panel>
            <PanelHead title="Devices" right={<KebabButton />} />
            <div className="flex items-center gap-6 p-5">
              <Donut
                slices={devices.map((d, i) => ({
                  name: d.name,
                  value: d.value,
                  color: deviceColors[i],
                }))}
                centerTop={`${devices.find((d) => d.name === "Desktop")?.value ?? 0}%`}
                centerBottom="desktop"
              />
              <ul className="flex-1 space-y-2.5">
                {devices.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: deviceColors[i] }}
                    />
                    <span className="flex-1 text-foreground">{d.name}</span>
                    <span className="tabular font-mono text-muted-foreground">
                      {d.value}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="Top locations"
              sub="Where your visitors are"
              right={<KebabButton />}
            />
            <div className="p-4">
              {locations.length ? (
                <BarList
                  items={locations.map((l) => ({
                    label: l.name,
                    value: l.value,
                    color: l.color,
                  }))}
                />
              ) : (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No location data captured yet.
                </p>
              )}
            </div>
          </Panel>

          <Panel className="flex-1">
            <PanelHead title="Live activity" sub="Real-time event stream" />
            <ul className="divide-y divide-border/60">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background:
                        a.kind === "convert"
                          ? "var(--pine)"
                          : a.kind === "friction"
                            ? "var(--ember)"
                            : "var(--muted-foreground)",
                    }}
                  />
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium text-foreground">{a.user}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>{" "}
                    <span className="font-mono text-[0.8rem] text-foreground/80">
                      {a.target}
                    </span>
                  </p>
                  <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                    {relativeTime(a.minutesAgo)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
