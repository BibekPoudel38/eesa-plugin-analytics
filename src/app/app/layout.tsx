import { AppShell } from "@/components/app/app-shell";
import { SessionBridge } from "@/components/app/session-bridge";
import { currentScope } from "@/lib/eesa/scope";

// Force dynamic: scope comes from per-request session cookies.
export const dynamic = "force-dynamic";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const scope = await currentScope();

  // No valid Eesa session yet — show a connecting state and let the bridge set
  // the cookie from the shell's postMessage token, then refresh into the app.
  if (!scope.authed) {
    return (
      <>
        <SessionBridge authed={false} />
        <div className="grid min-h-screen place-items-center p-8 text-center">
          <div className="space-y-3">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-muted border-t-ember" />
            <p className="text-sm text-muted-foreground">Connecting to your workspace…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SessionBridge authed />
      <AppShell sites={scope.sites} activeSiteId={scope.site?.id ?? null}>
        {children}
      </AppShell>
    </>
  );
}
