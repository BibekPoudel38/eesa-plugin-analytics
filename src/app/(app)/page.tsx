import { PageHeader } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { DataBadge } from "@/components/app/data-badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { getOverview, getLiveStatus } from "@/lib/data";
import { compactNumber, duration, percent, relativeTime } from "@/lib/format";

const deviceColors = ["var(--teal)", "var(--ember)", "var(--amber)"];

function bounceTone(v: number) {
  if (v < 30) return "var(--pine)";
  if (v < 45) return "var(--amber)";
  return "var(--ember)";
}

export default function OverviewPage() {
  const { live, kpis, trend, sources, topPages, devices, activity } = getOverview();
  const status = getLiveStatus();
  const totalSource = sources.reduce((s, x) => s + x.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={live ? "mom2mom · Production" : "Sprout · Demo"}
        title="Overview"
        description={
          live
            ? "Real-time behaviour from your tracked site."
            : "How sprout.app performed over the last 30 days."
        }
        actions={<DataBadge live={live} eventCount={status.eventCount} />}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </div>

      {/* trend + sources */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel className="lg:col-span-8">
          <PanelHead
            title="Traffic"
            sub="Sessions vs. active users"
            right={
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full bg-teal" />
                  Sessions
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0 w-4 border-t-2 border-dashed border-ember" />
                  Users
                </span>
              </div>
            }
          />
          <div className="p-4">
            <div className="h-[260px] w-full">
              <AreaChart
                data={trend.sessions}
                data2={trend.users}
                ariaLabel="Sessions and active users over the last 30 days"
              />
            </div>
            <div className="mt-2 flex justify-between px-1 font-mono text-[0.68rem] text-muted-foreground">
              <span>30 days ago</span>
              <span>3 wks</span>
              <span>2 wks</span>
              <span>1 wk</span>
              <span>Today</span>
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHead
            title="Traffic sources"
            sub={`${compactNumber(totalSource)} sessions`}
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
          <PanelHead title="Top pages" sub="Most-visited routes" />
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
            <PanelHead title="Devices" />
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
