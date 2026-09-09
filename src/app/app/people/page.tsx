import { Info, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { BarList } from "@/components/charts/bar-list";
import { NoSite } from "@/components/app/no-site";
import { getAppPeople } from "@/lib/data";
import { compactNumber } from "@/lib/format";
import { formatPhone } from "@/lib/eesa/directory";
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
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function day(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ago(iso: string): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "—";
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2.5 align-middle";

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
  const withPhone = d.rows.filter((r) => r.customer?.phone).length;

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
            Nobody identified in the app in this window. The app names a person
            by calling <code>analytics.identify()</code> after sign-in; until it
            does, their activity is still counted — it just belongs to a device
            rather than to somebody.
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
                <strong>Names are unavailable right now.</strong> Eesa&apos;s
                customer directory did not answer, so everyone below is shown by
                the id the app reports. The activity figures are unaffected.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "Signed in", value: compactNumber(d.rows.length), sub: "people the app named" },
              { label: "Reachable", value: compactNumber(withPhone), sub: "have a phone on file" },
              { label: "Ordered", value: compactNumber(d.commerce.buyers), sub: `${compactNumber(d.commerce.orders)} orders` },
              { label: "Spend", value: money(spend), sub: d.commerce.orders ? `${money(spend / d.commerce.orders)} average` : "no orders yet" },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border bg-card p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular text-foreground">{t.value}</p>
                <p className="text-xs text-muted-foreground">{t.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-8 overflow-hidden">
              <PanelHead
                title="Everyone in the app"
                sub="Ranked by spend. Contact details come from your own customer records, by id."
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className={TH}>Person</th>
                      <th className={TH}>Contact</th>
                      <th className={TH}>City</th>
                      <th className={`${TH} text-right`}>Visits</th>
                      <th className={`${TH} text-right`}>Screens</th>
                      <th className={`${TH} text-right`}>Added</th>
                      <th className={`${TH} text-right`}>Orders</th>
                      <th className={`${TH} text-right`}>Spend</th>
                      <th className={`${TH} text-right`}>Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {d.rows.slice(0, 200).map((r) => (
                      <tr key={r.userId} className="hover:bg-muted/30">
                        <td className={TD}>
                          <div className="font-medium text-foreground">
                            {r.customer?.name || r.userId}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.customer?.name ? `${r.userId} · ` : ""}
                            {r.platform || "unknown"}
                            {r.customer?.since ? ` · since ${day(r.customer.since)}` : ""}
                          </div>
                        </td>
                        <td className={TD}>
                          {r.customer?.phone ? (
                            <a
                              href={`tel:${r.customer.phone}`}
                              className="tabular text-foreground hover:underline"
                            >
                              {formatPhone(r.customer.phone)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {r.customer?.email && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.customer.email}
                            </div>
                          )}
                        </td>
                        <td className={`${TD} text-muted-foreground`}>
                          {r.customer?.city || "—"}
                        </td>
                        <td className={`${TD} text-right tabular`}>{r.sessions}</td>
                        <td className={`${TD} text-right tabular`}>{compactNumber(r.screens)}</td>
                        <td className={`${TD} text-right tabular`}>{r.carted || "—"}</td>
                        <td className={`${TD} text-right tabular`}>{r.orders || "—"}</td>
                        <td className={`${TD} text-right tabular font-medium text-foreground`}>
                          {r.spend ? money(r.spend) : "—"}
                        </td>
                        <td className={`${TD} text-right text-xs text-muted-foreground`}>
                          {ago(r.lastSeen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.rows.length > 200 && (
                <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
                  Showing the top 200 of {compactNumber(d.rows.length)} by spend.
                </p>
              )}
            </Panel>

            <div className="space-y-5 lg:col-span-4">
              <Panel>
                <PanelHead
                  title="Where they are"
                  sub="From your customer records — the app's events carry no location"
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
                </div>
              </Panel>

              <Panel>
                <PanelHead title="Where these names come from" />
                <div className="flex gap-3 p-5 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <p>
                    The app sends only a customer id — never a name or a phone
                    number. It couldn&apos;t: the endpoint that receives app
                    events is public, so anything posted there could be posted
                    by anyone. The details on this page are read from your own
                    customer records at the moment the page loads, by the ids
                    above, and are never stored in analytics.
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
