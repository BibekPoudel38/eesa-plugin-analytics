import Link from "next/link";
import { Play, Monitor, Smartphone, Tablet, Zap, Globe, MapPin } from "lucide-react";
import { PageHeader, Eyebrow } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { DataBadge } from "@/components/app/data-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getVisitorsData, type Visitor } from "@/lib/data";
import { compactNumber, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentScope } from "@/lib/eesa/scope";
import { NoSite } from "@/components/app/no-site";

export const dynamic = "force-dynamic";

const filters = [
  { key: "all", label: "All" },
  { key: "completed", label: "Converted" },
  { key: "cart", label: "Reached checkout" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

function matches(v: Visitor, key: FilterKey) {
  if (key === "completed") return v.completed;
  if (key === "cart") return v.inCart;
  return true;
}

const deviceIcon = { Desktop: Monitor, Mobile: Smartphone, Tablet: Tablet };

function initials(name: string) {
  // Prefer the distinctive segment after a separator so "user_u48q" → "U4"
  // rather than a uniform "US" for every anonymous id.
  const seg = name.includes("_") ? (name.split("_").pop() ?? name) : name;
  const letters = seg.replace(/[^a-zA-Z0-9]/g, "");
  return (letters.slice(0, 2) || "??").toUpperCase();
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

function VisitorRow({ v }: { v: Visitor }) {
  const DeviceIcon = deviceIcon[v.device];
  return (
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
      {/* visitor */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-8 border border-border">
            <AvatarFallback
              className={cn(
                "text-[0.7rem] font-semibold",
                v.anon
                  ? "bg-muted text-muted-foreground"
                  : "bg-teal/12 text-teal",
              )}
            >
              {initials(v.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {v.name}
              </span>
              {v.anon && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                  Anon
                </span>
              )}
              {v.completed && (
                <span className="rounded-full bg-[var(--pine)]/12 px-1.5 py-0.5 text-[0.6rem] font-medium text-[var(--pine)]">
                  Converted
                </span>
              )}
              {!v.completed && v.inCart && (
                <span className="rounded-full bg-teal/12 px-1.5 py-0.5 text-[0.6rem] font-medium text-teal">
                  Checkout
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* source */}
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
          <Globe className="size-3.5 text-muted-foreground" />
          {v.source}
        </span>
      </td>

      {/* location */}
      <td className="px-3 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
          <MapPin className="size-3.5 text-muted-foreground" />
          {v.location}
        </span>
      </td>

      {/* device + os */}
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5 font-mono text-xs text-foreground">
          <DeviceIcon className="size-3.5 text-muted-foreground" />
          {v.browser}
        </span>
        <span className="ml-5 block font-mono text-[0.68rem] text-muted-foreground">
          {v.os}
        </span>
      </td>

      {/* sessions */}
      <td className="tabular px-3 py-3 text-right font-mono text-[0.82rem] text-foreground">
        {v.sessions}
      </td>

      {/* events */}
      <td className="tabular px-3 py-3 text-right font-mono text-[0.82rem] text-muted-foreground">
        {compactNumber(v.events)}
      </td>

      {/* rage */}
      <td className="px-3 py-3">
        <div className="flex justify-end">
          {v.rageClicks > 0 ? (
            <span className="tabular inline-flex items-center gap-0.5 rounded-full bg-ember/12 px-1.5 py-0.5 font-mono text-[0.7rem] text-ember">
              <Zap className="size-3 fill-current" />
              {v.rageClicks}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted-foreground/50">—</span>
          )}
        </div>
      </td>

      {/* last seen */}
      <td className="tabular px-3 py-3 text-right font-mono text-xs text-muted-foreground">
        {relativeTime(v.lastSeenMinutesAgo)}
      </td>

      {/* recording — always opens the visitor's latest session; the play badge
          lights up ember when a screen recording is actually available */}
      <td className="px-5 py-3 text-right">
        <Link
          href={`/app/sessions/${v.sessionId}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5 text-xs font-medium shadow-[var(--shadow-card)] transition-colors hover:border-ember/40 hover:text-ember",
            v.hasRecording ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "grid size-4 place-items-center rounded-full",
              v.hasRecording
                ? "bg-ember text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Play className="size-2.5 translate-x-px fill-current" />
          </span>
          {v.hasRecording ? "Watch" : "View"}
        </Link>
      </td>
    </tr>
  );
}

export default async function VisitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; range?: string }>;
}) {
  const sp = await searchParams;
  const scope = await currentScope();
  if (!scope.site) return <NoSite />;
  const { live, visitors } = await getVisitorsData(scope.tenantId, scope.site.id, sp.range);
  const rq = sp.range ? { range: sp.range } : {};
  const active = (filters.find((f) => f.key === sp.f)?.key ?? "all") as FilterKey;
  const rows = visitors.filter((v) => matches(v, active));

  const completed = visitors.filter((v) => v.completed).length;
  const inCart = visitors.filter((v) => v.inCart).length;

  const activeLabel = filters.find((f) => f.key === active)?.label ?? "All";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audience · Visitors"
        title="Visitors"
        description="Everyone who's visited your site — grouped by person, with a jump straight to their replay."
        actions={<DataBadge live={live} />}
      />

      <Panel>
        <div className="grid grid-cols-3 divide-x divide-y divide-border/70 sm:divide-y-0">
          <Stat label="Visitors" value={String(visitors.length)} />
          <Stat label="Converted" value={String(completed)} />
          <Stat label="Reached checkout" value={String(inCart)} />
        </div>
      </Panel>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={{
              pathname: "/app/visitors",
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

      <Panel>
        <PanelHead
          title={active === "all" ? "All visitors" : activeLabel}
          sub={`${rows.length} people · newest first`}
        />
        {rows.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center text-sm text-muted-foreground">
            {visitors.length === 0
              ? "No visitors captured yet. Once tracking is live they'll appear here."
              : "No visitors match this filter yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Visitor</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Location</th>
                  <th className="px-3 py-2.5 font-medium">Device / OS</th>
                  <th className="px-3 py-2.5 text-right font-medium">Sessions</th>
                  <th className="px-3 py-2.5 text-right font-medium">Events</th>
                  <th className="px-3 py-2.5 text-right font-medium">Rage</th>
                  <th className="px-3 py-2.5 text-right font-medium">Last seen</th>
                  <th className="px-5 py-2.5 text-right font-medium">Replay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <VisitorRow key={v.key} v={v} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
