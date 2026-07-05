import Link from "next/link";
import { Fragment } from "react";
import { ArrowLeft, ChevronRight, Zap } from "lucide-react";
import { Eyebrow } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { ReplayPlayer } from "@/components/sessions/replay-player";
import { getSessionDetail } from "@/lib/data";
import { duration, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const outcomeStyle: Record<string, string> = {
  Converted: "bg-[var(--pine)]/12 text-[var(--pine)]",
  Bounced: "bg-destructive/12 text-destructive",
  Browsing: "bg-muted text-muted-foreground",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="tabular font-mono text-sm text-foreground">{value}</span>
    </div>
  );
}

export default async function SessionReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = getSessionDetail(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/sessions"
          className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to sessions"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <Eyebrow>Session replay</Eyebrow>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            {session ? session.user : "Session"}
            <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
              {session?.id ?? id}
            </span>
          </h1>
        </div>
        {session && (
          <span
            className={cn(
              "ml-auto rounded-full px-2.5 py-1 text-xs font-medium",
              outcomeStyle[session.outcome],
            )}
          >
            {session.outcome}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ReplayPlayer id={id} />
        </div>

        <div className="flex flex-col gap-5 lg:col-span-4">
          <Panel>
            <PanelHead title="Session details" />
            {session ? (
              <div className="divide-y divide-border/60">
                <Row label="Visitor" value={session.user} />
                <Row label="Device" value={`${session.device} · ${session.browser}`} />
                <Row label="Duration" value={duration(session.durationSec)} />
                <Row label="Pages" value={String(session.pages)} />
                <Row label="Events" value={String(session.events)} />
                <Row
                  label="Started"
                  value={relativeTime(session.startedMinutesAgo)}
                />
                <div className="flex items-center justify-between px-5 py-2.5">
                  <span className="text-sm text-muted-foreground">Rage clicks</span>
                  {session.rageClicks > 0 ? (
                    <span className="inline-flex items-center gap-1 font-mono text-sm text-ember">
                      <Zap className="size-3.5 fill-current" />
                      {session.rageClicks}
                    </span>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">0</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No metadata for this session.
              </p>
            )}
          </Panel>

          {session && session.path.length > 0 && (
            <Panel>
              <PanelHead title="Journey" />
              <div className="flex flex-wrap items-center gap-1 p-4">
                {session.path.map((p, i) => (
                  <Fragment key={i}>
                    {i > 0 && (
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.72rem] text-muted-foreground">
                      {p}
                    </span>
                  </Fragment>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
