import { PageHeader } from "@/components/app/primitives";
import { GoalManager, type GoalRow } from "@/components/goals/goal-manager";
import { FunnelManager, type FunnelRow } from "@/components/goals/funnel-manager";
import { listGoals } from "@/lib/db/goals";
import { listFunnels } from "@/lib/db/funnels";
import { currentScope } from "@/lib/eesa/scope";
import { NoSite } from "@/components/app/no-site";

/**
 * Conversion cards — the tenant's own definitions.
 *
 * This is the framework the whole "what counts as a conversion" question hangs
 * off. Before it, `completed` / `inCart` were hardcoded English path fragments
 * in the aggregator, identical for every tenant — so any site that doesn't say
 * "cart" or "thank-you" measured zero and had no way to fix it.
 */
export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const scope = await currentScope();
  if (!scope.site) return <NoSite />;
  const [goals, funnels] = await Promise.all([
    listGoals(scope.tenantId, scope.site.id),
    listFunnels(scope.tenantId, scope.site.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={scope.site.domain || scope.site.name}
        title="Conversion cards"
        description="Define what counts as a conversion for this site. Each card appears on the Overview with its session count and rate."
      />
      <GoalManager siteId={scope.site.id} initial={goals as GoalRow[]} />

      <div className="border-t border-border pt-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Funnels</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          An ordered path through the site. Steps use the same rules as the cards above,
          and each step counts only sessions that passed the one before it.
        </p>
        <FunnelManager siteId={scope.site.id} initial={funnels as FunnelRow[]} />
      </div>
    </div>
  );
}
