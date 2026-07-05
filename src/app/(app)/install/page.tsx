import { headers } from "next/headers";
import { PageHeader, Eyebrow } from "@/components/app/primitives";
import { Panel, PanelHead } from "@/components/app/panel";
import { CopyButton } from "@/components/install/copy-button";
import { LiveStatus } from "@/components/install/live-status";

export const dynamic = "force-dynamic";

function CodeBlock({ code, caption }: { code: string; caption: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[#14171a]">
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

  const snippet = `<script src="${origin}/chups.js" data-site="mom2mom" defer></script>`;
  const customExample = `// fire whenever someone adds a meal to their cart\nchups('add_to_cart', { meal: 'Chicken Biryani', price: 12 });`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup · Tracking"
        title="Install"
        description="Drop one line into Mom2Mom and Chups starts mapping real behaviour."
      />

      {onLocalhost && (
        <div className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-foreground">
          <span className="font-medium">Heads up —</span> you&apos;re viewing
          Chups on <span className="font-mono text-xs">localhost</span>. A
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
                Mom2Mom is a multi-page site, so include it on each{" "}
                <span className="font-mono text-xs">.html</span> page — or add it
                once to a shared partial. The script auto-detects its own origin,
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
                <span className="font-mono text-xs">chups(name, props)</span> for
                product events like checkout or reservations — they show up in
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
          <LiveStatus />
        </div>
      </div>
    </div>
  );
}
