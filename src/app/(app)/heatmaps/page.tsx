import Link from "next/link";
import { PageHeader } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { HeatViewer, type HeatMode } from "@/components/heatmaps/heat-viewer";
import { heatPages } from "@/lib/mock/data";
import { compactNumber, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

const modes: { key: HeatMode; label: string }[] = [
  { key: "click", label: "Clicks" },
  { key: "attention", label: "Attention" },
  { key: "scroll", label: "Scroll" },
];

function rageTone(rate: number) {
  if (rate >= 10) return "text-ember";
  if (rate >= 3) return "text-amber";
  return "text-muted-foreground";
}

export default async function HeatmapsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const page = heatPages.find((h) => h.path === sp.p) ?? heatPages[0];
  const mode = (modes.find((m) => m.key === sp.mode)?.key ?? "click") as HeatMode;
  const maxClicks = Math.max(...page.elements.map((e) => e.clicks));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Behavior · Heatmaps"
        title="Heatmaps"
        description="Where clicks and attention pool on each page — and where they don't."
        actions={
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {modes.map((m) => (
              <Link
                key={m.key}
                href={{ pathname: "/heatmaps", query: { p: page.path, mode: m.key } }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === m.key
                    ? "bg-ember text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* stage */}
        <div className="lg:col-span-8">
          <HeatViewer page={page} mode={mode} />
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            Showing an aggregate of{" "}
            <span className="tabular font-mono text-foreground">
              {compactNumber(page.views)}
            </span>{" "}
            visits to{" "}
            <span className="font-mono text-foreground">{page.path}</span>. The
            wireframe stands in for a captured screenshot in this demo.
          </p>
        </div>

        {/* right rail */}
        <div className="flex flex-col gap-5 lg:col-span-4">
          <Panel>
            <PanelHead title="Pages" sub="Pick a page to inspect" />
            <ul className="p-2">
              {heatPages.map((h) => {
                const active = h.path === page.path;
                return (
                  <li key={h.path}>
                    <Link
                      href={{ pathname: "/heatmaps", query: { p: h.path, mode } }}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors",
                        active ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[0.8rem] text-foreground">
                          {h.path}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {h.title}
                        </span>
                      </span>
                      <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                        {compactNumber(h.views)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel>
            <PanelHead
              title="Most-clicked elements"
              sub="Rage rate flags friction"
            />
            <ul className="flex flex-col gap-1 p-3">
              {page.elements.map((el) => (
                <li key={el.label} className="relative rounded-lg px-2.5 py-2">
                  <div
                    className="absolute inset-y-0 left-0 rounded-lg bg-ember-soft"
                    style={{ width: `${(el.clicks / maxClicks) * 100}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {el.label}
                    </span>
                    <span className="tabular shrink-0 font-mono text-[0.8rem]">
                      {compactNumber(el.clicks)}
                    </span>
                  </div>
                  <div className="relative mt-0.5">
                    <span
                      className={cn(
                        "font-mono text-[0.68rem]",
                        rageTone(el.rageRate),
                      )}
                    >
                      {percent(el.rageRate)} rage
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
