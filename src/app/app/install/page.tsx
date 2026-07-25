import { headers } from "next/headers";
import { Globe } from "lucide-react";
import { PageHeader, Eyebrow } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { CopyButton } from "@/components/install/copy-button";
import { LiveStatus } from "@/components/install/live-status";
import { currentScope } from "@/lib/eesa/scope";
import { NoSite } from "@/components/app/no-site";

export const dynamic = "force-dynamic";

function CodeBlock({ code, caption }: { code: string; caption: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-[#14171a] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[#ecece6]/50">
          {caption}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8rem] leading-relaxed text-[#ecece6]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default async function InstallPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3111";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const onLocalhost = host.includes("localhost") || host.includes("127.0.0.1");

  const scope = await currentScope();
  if (!scope.site) return <NoSite />;
  const site = scope.site;
  const sites = scope.sites;

  // The snippet is unique per site — its data-site is the site's public
  // tracking key, which maps ingest back to this tenant + site.
  const snippet = `<script src="${origin}/eesa-analytics.js" data-site="${site.trackingKey}" defer></script>`;
  const customExample = `// fire a custom event whenever something important happens\neesa('signup', { plan: 'pro' });`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup · Tracking"
        title="Install"
        description={`Add one line to ${site.domain || site.name} and analytics start flowing in.`}
      />

      {/* the tenant's sites; the active one owns the snippet below */}
      <Panel>
        <PanelHead
          title="Your sites"
          sub="Each site has its own snippet — switch sites in the sidebar"
        />
        <div className="p-5">
          <ul className="space-y-2">
            {sites.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--pine)]/12 text-[var(--pine)]">
                  <Globe className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {s.name}
                  {s.domain ? (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {s.domain}
                    </span>
                  ) : null}
                </span>
                {s.id === site.id && (
                  <span className="shrink-0 rounded-full bg-ember/12 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-ember">
                    Active
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {onLocalhost && (
        <div className="rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-foreground shadow-[var(--shadow-card)]">
          <span className="font-medium">Heads up —</span> you&apos;re viewing
          Eesa Analytics on <span className="font-mono text-xs">localhost</span>. A
          deployed site can&apos;t reach that. Start a tunnel (e.g.{" "}
          <span className="font-mono text-xs">
            cloudflared tunnel --url http://localhost:3111
          </span>
          ), then open this page through the tunnel URL — the snippet below will
          update to point at it automatically.
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <Panel>
            <PanelHead
              title="1 · Add the snippet"
              sub="Before </body> on every page (or in a shared footer/layout)"
            />
            <div className="space-y-3 p-5">
              <CodeBlock code={snippet} caption="index.html" />
              <p className="text-sm text-muted-foreground">
                For a multi-page site, include it on every page — or add it once
                to a shared footer/layout. The script auto-detects its own origin,
                so there&apos;s nothing else to configure.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="2 · Track custom events"
              sub="Optional — measure the moments that matter"
            />
            <div className="space-y-3 p-5">
              <CodeBlock code={customExample} caption="example" />
              <p className="text-sm text-muted-foreground">
                Page views, clicks, scroll depth, rage &amp; dead clicks and
                sessions are captured automatically. Call{" "}
                <span className="font-mono text-xs">eesa(name, props)</span> for
                product events like signups or checkout — they show up in
                Funnels &amp; events.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Endpoint" sub="Where events are sent" />
            <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Eyebrow>Ingest URL</Eyebrow>
                <p className="mt-1 font-mono text-sm text-foreground">
                  {origin}/api/collect
                </p>
              </div>
              <CopyButton text={`${origin}/api/collect`} label="Copy URL" />
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <LiveStatus siteId={site.id} />
        </div>
      </div>
    </div>
  );
}
