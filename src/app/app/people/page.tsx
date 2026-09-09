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

export default async function AppPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const scope = await currentScope();
  if (!scope.authed || !scope.site) return <NoSite />;
  const { range } = await searchParams;

  const d = await getAppPeople(scope.tenantId, scope.site.id, range);
  const spend = d.rows.reduce((a, r) => a + r.spend, 0);
  const buyers = d.segments.repeat + d.segments.once;

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
