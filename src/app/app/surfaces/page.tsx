import { Smartphone, Monitor, Radio, TriangleAlert } from "lucide-react";

import { PageHeader, Eyebrow } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { RangeTabs } from "@/components/app/range-filter";
import { NoSite } from "@/components/app/no-site";
import { getAppData, getCrossSurface, getSurfaces } from "@/lib/data";
import { compactNumber } from "@/lib/format";
import { currentScope } from "@/lib/eesa/scope";

export const dynamic = "force-dynamic";

/**
 * Web against app — the split, and whether each side is still reporting.
 *
 * The website and the mobile app report through one tracking key on purpose,
 * so a customer who browses on mobile web and orders in the app stays one
 * person rather than two strangers in two dashboards. Every other page here is
 * better for that choice.
 *
 * This page is where the bill for it is paid. Merged into one stream a broken
 * surface is invisible: it stops sending into traffic that is still busy, and
 * reads as a quiet week. The App section has the detail; this one answers the
 * two questions the merge makes hard — how do they compare, and is each of
 * them still alive.
 */

const LABEL: Record<string, string> = {
  web: "Website",
  app: "Mobile app",
  installed: "Installed web app",
  unknown: "Older tracker",
};

const HELP: Record<string, string> = {
  web: "The site in a normal browser tab.",
  app: "The mobile app, through the same tracking key.",
  installed: "The site added to a home screen and opened standalone.",
  unknown:
    "Sent before the tracker reported which surface it was. This one is meant to shrink — older clients, draining away as they update.",
};

const ICON: Record<string, typeof Monitor> = {
  web: Monitor,
  app: Smartphone,
  installed: Smartphone,
  unknown: Radio,
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function change(now: number, before: number): string {
  if (!before) return now ? "new this week" : "";
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return "level with the week before";
  return `${pct > 0 ? "+" : ""}${pct}% vs the week before`;
}

function Side({
  label,
  icon: Icon,
  totals,
}: {
  label: string;
  icon: typeof Smartphone;
  totals: { events: number; sessions: number; visitors: number; identified: number };
}) {
  const signedIn = totals.visitors
    ? Math.round((totals.identified / totals.visitors) * 100)
    : 0;
  return (
    <div className="flex-1 space-y-3 p-5">
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4" />
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

export default async function WebAndAppPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const scope = await currentScope();
  if (!scope.authed || !scope.site) return <NoSite />;
  const { range } = await searchParams;

  const [d, surfaces, both] = await Promise.all([
    getAppData(scope.tenantId, scope.site.id, range, scope.site.timezone),
    getSurfaces(scope.tenantId, 7),
    getCrossSurface(scope.tenantId, scope.site.id, range),
  ]);
  const site = surfaces.sites.find((s) => s.id === scope.site!.id);
  const rows = (site?.surfaces ?? []).filter((s) => s.events > 0 || s.stopped);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Reporting"
        title="Web &amp; app"
        description="One tracking key, so the funnel stays whole — which also means a broken surface looks like a quiet week. This page separates them again."
      />

      {!d.hasApp && (
        // The state that looks healthiest of all: a wrong key is answered
        // 202 {"ok":true,"accepted":0}, indistinguishable from success, so a
        // live website proves nothing about the app.
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

      <Panel>
        <PanelHead
          title="App against website"
          sub="Same key, same customers, separated only here"
          right={<RangeTabs />}
        />
        <div className="flex flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0">
          <Side label="Mobile app" icon={Smartphone} totals={d.app} />
          <Side label="Website" icon={Monitor} totals={d.web} />
        </div>
      </Panel>

      {/* Every surface, including the two the comparison folds away, and always
          over a fixed week so "it stopped" is a like-for-like statement rather
          than an artefact of whichever range is selected above. */}
      <Panel>
        <PanelHead
          title="Is each surface still reporting?"
          sub="Last 7 days against the 7 before — silence only reads as silence next to what came before"
        />
        <div className="divide-y">
          {rows.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">
              Nothing has reported for this site in the last 7 days.
            </p>
          )}
          {rows.map((s) => {
            const Icon = ICON[s.kind] ?? Radio;
            const signedIn = s.visitors
              ? Math.round((s.identified / s.visitors) * 100)
              : 0;
            return (
              <div
                key={s.kind}
                className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-sm"
              >
                <span
                  className="flex min-w-[10rem] items-center gap-2 font-medium"
                  title={HELP[s.kind]}
                >
                  <Icon className="size-4" />
                  {LABEL[s.kind] ?? s.kind}
                </span>
                {s.stopped ? (
                  <span className="rounded-full border border-rose-500/40 px-2.5 py-0.5 text-xs text-rose-600 dark:text-rose-400">
                    stopped — {compactNumber(s.priorEvents)} the week before, none since
                  </span>
                ) : (
                  <>
                    <span className="tabular">{compactNumber(s.events)} events</span>
                    <span className="text-muted-foreground">
                      {change(s.events, s.priorEvents)}
                    </span>
                    <span className="text-muted-foreground">
                      {compactNumber(s.visitors)} people · {signedIn}% signed in
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      last {ago(s.lastSeen)}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* The reason both surfaces report through one tracking key. Counted
          separately, somebody who browses on the web and orders in the app is
          two strangers, and every funnel crossing the two is wrong. */}
      <Panel>
        <PanelHead
          title="People who use both"
          sub="The same customer on the website and in the app — one person, not two"
        />
        {both.length ? (
          <>
            <p className="px-5 pt-4 text-sm text-muted-foreground">
              <strong className="text-foreground">{both.length}</strong> signed-in
              {both.length === 1 ? " customer uses" : " customers use"} both. They
              are counted once everywhere on this dashboard because the two
              surfaces share one tracking key.
            </p>
            <div className="divide-y">
              {both.slice(0, 10).map((p) => (
                <div key={p.userId} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {p.name || p.userId}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    app {compactNumber(p.appEvents)}
                    {p.appOrders > 0 && ` · ${p.appOrders} order${p.appOrders === 1 ? "" : "s"}`}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    web {compactNumber(p.webEvents)}
                    {p.webOrders > 0 && ` · ${p.webOrders} order${p.webOrders === 1 ? "" : "s"}`}
                  </span>
                </div>
              ))}
            </div>
            {both.length > 10 && (
              <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                Showing 10 of {both.length}, most recently seen first.
              </p>
            )}
          </>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Nobody signed in has used both the app and the website in this
            window. That is expected while most website visitors browse without
            signing in — the website records no orders at all today.
          </p>
        )}
      </Panel>
    </div>
  );
}
