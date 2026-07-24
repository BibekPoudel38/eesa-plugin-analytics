import { PageHeader, Eyebrow, DeltaPill } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { FunnelChart } from "@/components/funnels/funnel-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { DataBadge } from "@/components/app/data-badge";
import { getFunnelsData } from "@/lib/data";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import { currentScope } from "@/lib/eesa/scope";
import { NoSite } from "@/components/app/no-site";

export const dynamic = "force-dynamic";

function cohortBg(v: number | null) {
  if (v === null) return "transparent";
  // teal fill, opacity scaled by retention strength
  return `color-mix(in srgb, var(--teal) ${Math.round(v)}%, transparent)`;
}

export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const scope = await currentScope();
  if (!scope.site) return <NoSite />;
  const { live, funnel, events, retention } = await getFunnelsData(scope.tenantId, scope.site.id, range);
  const overall =
    (funnel.steps[funnel.steps.length - 1].users / funnel.steps[0].users) * 100;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversion · Funnels & events"
        title="Funnels & events"
        description="Follow the path from first visit to activation, and watch every event that fires along the way."
        actions={<DataBadge live={live} />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* funnel */}
        <Panel className="lg:col-span-7">
          <PanelHead
            title={funnel.name}
            sub={live ? `${funnel.window} · demo` : funnel.window}
            right={
              <div className="text-right">
                <div className="tabular font-display text-lg font-bold leading-none text-foreground">
                  {percent(overall)}
                </div>
                <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted-foreground">
                  end-to-end
                </div>
              </div>
            }
          />
          <div className="p-5">
            <FunnelChart steps={funnel.steps} />
          </div>
        </Panel>

        {/* retention */}
        <Panel className="lg:col-span-5">
          <PanelHead
            title="Weekly retention"
            sub={live ? "% of cohort still active · demo" : "% of cohort still active"}
          />
          <div className="overflow-x-auto p-4">
            <table className="w-full border-separate border-spacing-1 text-center">
              <thead>
                <tr>
                  <th className="pb-1 text-left">
                    <Eyebrow>Cohort</Eyebrow>
                  </th>
                  {retention.weeks.map((w) => (
                    <th
                      key={w}
                      className="pb-1 font-mono text-[0.68rem] font-medium text-muted-foreground"
                    >
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retention.cohorts.map((c) => (
                  <tr key={c.label}>
                    <td className="py-0.5 pr-2 text-left">
                      <span className="font-mono text-xs text-foreground">
                        {c.label}
                      </span>
                      <span className="ml-1 font-mono text-[0.62rem] text-muted-foreground">
                        {c.size}
                      </span>
                    </td>
                    {c.values.map((v, i) => (
                      <td key={i} className="p-0">
                        <div
                          className="tabular grid h-8 place-items-center rounded-md font-mono text-[0.7rem] text-foreground"
                          style={{ background: cohortBg(v) }}
                        >
                          {v === null ? "" : `${v}%`}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* events */}
      <Panel>
        <PanelHead title="Events" sub="What users are doing across the product" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Event</th>
                <th className="px-3 py-2.5 text-right font-medium">Users</th>
                <th className="px-3 py-2.5 text-right font-medium">Count</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">
                  30-day trend
                </th>
                <th className="px-5 py-2.5 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.name}
                  className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-teal" />
                      <span className="font-mono text-[0.82rem] text-foreground">
                        {e.name}
                      </span>
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-right font-mono text-[0.82rem] text-muted-foreground">
                    {compactNumber(e.users)}
                  </td>
                  <td className="tabular px-3 py-3 text-right font-mono text-[0.82rem]">
                    {fullNumber(e.count)}
                  </td>
                  <td className="hidden px-3 py-3 sm:table-cell">
                    <div className="h-8 w-32">
                      <Sparkline
                        data={e.spark}
                        color={e.delta >= 0 ? "var(--teal)" : "var(--ember)"}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <DeltaPill delta={e.delta} goodUp />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
