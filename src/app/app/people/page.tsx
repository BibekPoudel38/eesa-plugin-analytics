import { Info, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { BarList } from "@/components/charts/bar-list";
import { NoSite } from "@/components/app/no-site";
import { PeopleTable } from "@/components/app/people-table";
import { getAppPeople } from "@/lib/data";
import { compactNumber } from "@/lib/format";
import { currentScope } from "@/lib/eesa/scope";

export const dynamic = "force-dynamic";

/**
 * Who is using the app.
 *
 * Every other page here counts. This one names — and the two halves of a name
 * come from different places on purpose. The analytics database holds
 * `identify("CUS-6931")` and nothing else about a person, because the endpoint
 * that receives it is public. The name, phone and city are read from the
 * tenant's own database, by id, at render time.
 *
 * When that lookup is unavailable the table still renders on the ids. A page
 * about people that refuses to load because a name was missing would be the
 * worse failure.
 */

function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/**
 * Does anyone come back?
 *
 * Day 0 is everyone, by definition — the bar worth reading is day 1, and the
 * shape after it. Each bar's denominator counts only people who had been using
 * the app long enough to be able to return by then; somebody who installed it
 * yesterday is not evidence about day 7, and including them would drag the
 * whole curve down and make a healthy app look like it was dying.
 */
function Retention({ points }: { points: { day: number; eligible: number; returned: number }[] }) {
  const usable = points.filter((p) => p.eligible > 0);
  if (usable.length < 2) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        Not enough history yet to say whether people come back.
      </p>
    );
  }
  const day1 = usable.find((p) => p.day === 1);
  const last = usable[usable.length - 1];
  const pct = (p: { eligible: number; returned: number }) =>
    p.eligible ? (p.returned / p.eligible) * 100 : 0;
  return (
    <div className="p-5">
      <p className="mb-4 text-sm text-muted-foreground">
        {day1 && (
          <>
            <strong className="text-foreground">{Math.round(pct(day1))}%</strong> come
            back the next day
          </>
        )}
        {day1 && last.day > 1 && (
          <>
            , <strong className="text-foreground">{Math.round(pct(last))}%</strong> are
            still opening it {last.day} days on
          </>
        )}
        .
      </p>
      <div className="flex h-28 items-end gap-1.5">
        {usable.map((p) => (
          <div
            key={p.day}
            className="flex flex-1 flex-col justify-end"
            title={`Day ${p.day}: ${p.returned} of ${p.eligible} came back`}
          >
            <span className="mb-1 text-center text-[10px] tabular text-muted-foreground">
              {Math.round(pct(p))}%
            </span>
            <div
              className="w-full rounded-t-sm bg-[var(--teal)]"
              style={{ height: `${Math.max(pct(p), 1.5)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-center text-[10px] text-muted-foreground">
        {usable.map((p) => (
          <span key={p.day} className="flex-1">
            {p.day === 0 ? "first" : `d${p.day}`}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function AppPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const scope = await currentScope();
  if (!scope.authed || !scope.site) return <NoSite />;
  const { range } = await searchParams;

  const d = await getAppPeople(scope.tenantId, scope.site.id, range, scope.site.timezone);
  const spend = d.rows.reduce((a, r) => a + r.spend, 0);
  const buyers = d.segments.repeat + d.segments.once;
  const topLifetime = [...d.rows]
    .filter((r) => r.lifetimeSpend > 0)
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
    .slice(0, 8);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Mobile app"
        title="People"
        description="Everyone who signed in on the app, what they did, and who they are."
        actions={
          <span className="text-xs text-muted-foreground">
            {compactNumber(d.rows.length)} signed in · {compactNumber(d.named)} named
          </span>
        }
      />

      {!d.rows.length ? (
        <Panel>
          <p className="p-6 text-sm text-muted-foreground">
            Nobody signed in on the app in this window. Anyone browsing
            without signing in is still counted everywhere else on this
            dashboard — their visits just belong to a phone rather than to a
            person we can name.
          </p>
        </Panel>
      ) : (
        <>
          {!d.directoryUp && (
            // Never silent. Without this the table looks like a customer list
            // where nobody has a name, which is a different and much more
            // alarming thing than a lookup being down.
            <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong>Names are unavailable right now.</strong> Your
                customer records did not answer, so everyone below is shown by
                their customer number instead. Everything else on this page —
                visits, orders, spend — is unaffected.
              </p>
            </div>
          )}

          {/* The shape of the audience, not the same number four times. Who
              came back is a different question from who never ordered, and
              only one of them is a problem you can do something about. */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Tile
              label="Came back"
              value={compactNumber(d.segments.repeat)}
              sub={buyers ? `${Math.round((d.segments.repeat / buyers) * 100)}% of buyers` : "no orders yet"}
            />
            <Tile
              label="Ordered once"
              value={compactNumber(d.segments.once)}
              sub="the people to win back"
            />
            <Tile
              label="Never ordered"
              value={compactNumber(d.segments.browsing)}
              sub={`signed in, browsed ${compactNumber(d.rows.filter((r) => r.orders === 0).reduce((a, r) => a + r.screens, 0))} screens`}
            />
            <Tile
              label="Spend"
              value={money(spend)}
              sub={d.commerce.orders ? `${money(spend / d.commerce.orders)} average · ${compactNumber(d.commerce.orders)} orders` : "no orders yet"}
            />
          </div>

          {/* Full width. Spend and orders are the point of this table, and at
              two-thirds width with ten columns they sat off the right edge
              behind a horizontal scrollbar nobody would think to drag. */}
          <Panel className="overflow-hidden">
            <PanelHead
              title="Everyone in the app"
              sub="Search by name, phone, email or dish. Contact details come from your own customer records."
            />
            <PeopleTable rows={d.rows} />
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-7">
              <PanelHead
                title="Do they come back?"
                sub="Of the people using the app, how many open it again"
              />
              <Retention points={d.retention} />
            </Panel>

            <Panel className="lg:col-span-5">
              <PanelHead
                title="Worth the most"
                sub="Total spend since they started, not just this window"
              />
              <div className="divide-y">
                {topLifetime.length ? (
                  topLifetime.map((r) => (
                    <div key={r.userId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-foreground">
                          {r.customer?.name || r.userId}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.lifetimeOrders} order{r.lifetimeOrders === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular font-medium text-foreground">
                        {money(r.lifetimeSpend)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm text-muted-foreground">No orders yet.</p>
                )}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-5">
              <PanelHead
                title="Where they are"
                sub="From your customer records — the app itself does not report where people are"
              />
              <div className="p-5">
                {d.cities.length ? (
                  <BarList
                    items={d.cities.slice(0, 10).map((c) => ({ label: c.name, value: c.value }))}
                    valueFormatter={compactNumber}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No city on file for anyone in this window.
                  </p>
                )}
                {(d.zipOnly > 0 || d.noCity > 0) && (
                  // Said plainly rather than ranking a postcode next to a place
                  // name, which is what the column actually contains.
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    {d.zipOnly > 0 && <>{compactNumber(d.zipOnly)} have only a postcode on file</>}
                    {d.zipOnly > 0 && d.noCity > 0 && " · "}
                    {d.noCity > 0 && <>{compactNumber(d.noCity)} have no city at all</>}
                  </p>
                )}
              </div>
            </Panel>

            <Panel className="lg:col-span-7">
              <PanelHead title="Where these names come from" />
              <div className="flex gap-3 p-5 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" />
                <p>
                  The app never sends anyone&apos;s name or phone number to
                  analytics — only a customer number. That is deliberate:
                  anything the app can send, anyone else could send too, so
                  personal details are kept out of it entirely. Names, phones
                  and cities on this page are read from your own customer
                  records at the moment you open it, matched on those customer
                  numbers, and are never stored here. Favourite dish and
                  delivery-or-pickup come from what people actually did in the
                  app.
                </p>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
