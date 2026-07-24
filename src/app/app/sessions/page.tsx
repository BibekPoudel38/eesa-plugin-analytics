import Link from "next/link";
import { Fragment } from "react";
import { Play, ChevronRight, Zap, Monitor, Smartphone, Tablet } from "lucide-react";
import { PageHeader, Eyebrow } from "@/components/app/primitives";
import { Panel } from "@/components/app/panel";
import { DataBadge } from "@/components/app/data-badge";
import { type SessionRow } from "@/lib/mock/data";
import { getSessionsData } from "@/lib/data";
import { duration, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentScope } from "@/lib/eesa/scope";
import { NoSite } from "@/components/app/no-site";

export const dynamic = "force-dynamic";

const filters = [
  { key: "all", label: "All" },
  { key: "converted", label: "Converted" },
  { key: "bounced", label: "Bounced" },
  { key: "friction", label: "Rage clicks" },
] as const;

const deviceIcon = { Desktop: Monitor, Mobile: Smartphone, Tablet: Tablet };

const outcomeStyle: Record<SessionRow["outcome"], string> = {
  Converted: "bg-[var(--pine)]/12 text-[var(--pine)]",
  Bounced: "bg-destructive/12 text-destructive",
  Browsing: "bg-muted text-muted-foreground",
};

function matches(s: SessionRow, key: string) {
  if (key === "converted") return s.outcome === "Converted";
  if (key === "bounced") return s.outcome === "Bounced";
  if (key === "friction") return s.rageClicks > 0;
  return true;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <Eyebrow>{label}</Eyebrow>
      <span className="tabular font-display text-xl font-bold tracking-tight text-foreground">
        {value}
      </span>
    </div>
  );
}

function Filmstrip({ session }: { session: SessionRow }) {
  return (
    <div className="relative grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-gradient-to-br from-muted to-secondary">
      {/* faux frames */}
      <div className="absolute inset-0 flex opacity-60">
        {session.path.slice(0, 3).map((_, i) => (
          <div
            key={i}
            className="flex-1 border-r border-border/70 last:border-0"
            style={{ background: i % 2 ? "var(--card)" : "transparent" }}
          />
        ))}
      </div>
      <span className="relative grid size-7 place-items-center rounded-full bg-ember text-primary-foreground shadow-sm">
        <Play className="size-3.5 translate-x-px fill-current" />
      </span>
    </div>
  );
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const scope = await currentScope();
  if (!scope.site) return <NoSite />;
  const { live, sessions } = await getSessionsData(scope.tenantId, scope.site.id, sp.range);
  const rq = sp.range ? { range: sp.range } : {};
  const active = filters.find((f) => f.key === sp.f)?.key ?? "all";
  const rows = sessions.filter((s) => matches(s, active));

  const avg = sessions.length
    ? Math.round(sessions.reduce((s, x) => s + x.durationSec, 0) / sessions.length)
    : 0;
  const withRage = sessions.filter((s) => s.rageClicks > 0).length;
  const converted = sessions.filter((s) => s.outcome === "Converted").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Behavior · Session replay"
        title="Sessions"
        description="Replay real visits. Spot where people hesitate, rage-click, or drop."
        actions={<DataBadge live={live} />}
      />

      <Panel>
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Sessions" value={String(sessions.length)} />
          <Stat label="Avg. duration" value={duration(avg)} />
          <Stat label="With rage clicks" value={`${withRage}`} />
          <Stat label="Converted" value={`${converted}`} />
        </div>
      </Panel>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={{
              pathname: "/app/sessions",
              query: { ...(f.key === "all" ? {} : { f: f.key }), ...rq },
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active === f.key
                ? "border-transparent bg-foreground text-background shadow-[var(--shadow-card)]"
                : "border-border/70 bg-card text-muted-foreground shadow-[var(--shadow-card)] hover:border-border hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
        <span className="tabular ml-auto font-mono text-xs text-muted-foreground">
          {rows.length} shown
        </span>
      </div>

      {/* list */}
      <Panel className="divide-y divide-border">
        {rows.map((s) => {
          const DeviceIcon = deviceIcon[s.device];
          return (
            <div
              key={s.id}
              className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5"
            >
              <Link
                href={{ pathname: `/app/sessions/${s.replayId ?? s.id}` }}
                aria-label={`Replay ${s.user}'s session`}
              >
                <Filmstrip session={s} />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={{ pathname: `/app/sessions/${s.replayId ?? s.id}` }}
                    className="truncate font-medium text-foreground hover:text-ember"
                  >
                    {s.user}
                  </Link>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
                      outcomeStyle[s.outcome],
                    )}
                  >
                    {s.outcome}
                  </span>
                  {s.hasRecording && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ember/12 px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold uppercase tracking-wide text-ember">
                      <span className="size-1.5 rounded-full bg-ember" />
                      Rec
                    </span>
                  )}
                  {s.rageClicks > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-ember/12 px-1.5 py-0.5 font-mono text-[0.68rem] text-ember">
                      <Zap className="size-3 fill-current" />
                      {s.rageClicks}
                    </span>
                  )}
                </div>
                {/* journey */}
                <div className="mt-1 flex items-center gap-1 overflow-hidden">
                  {s.path.map((p, i) => (
                    <Fragment key={i}>
                      {i > 0 && (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                        {p}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* meta */}
              <div className="hidden shrink-0 items-center gap-6 md:flex">
                <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <DeviceIcon className="size-3.5" />
                  {s.browser}
                </span>
                <span className="w-24 truncate text-xs text-muted-foreground">
                  {s.location}
                </span>
                <span className="tabular w-14 text-right font-mono text-sm text-foreground">
                  {duration(s.durationSec)}
                </span>
                <span className="tabular w-16 text-right font-mono text-xs text-muted-foreground">
                  {s.events} events
                </span>
              </div>

              <span className="tabular hidden shrink-0 text-right font-mono text-xs text-muted-foreground sm:block sm:w-16">
                {relativeTime(s.startedMinutesAgo)}
              </span>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
