import Link from "next/link";
import { Globe } from "lucide-react";

/** Empty state when the workspace has no tracked sites yet. */
export function NoSite() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div className="max-w-sm space-y-4">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ember/12 text-ember">
          <Globe className="size-6" />
        </span>
        <h2 className="text-lg font-semibold text-foreground">Add your first site</h2>
        <p className="text-sm text-muted-foreground">
          Create a site to get a tracking snippet. Paste it into your website and
          your analytics will start flowing in here.
        </p>
        <Link
          href="/app/install"
          className="inline-flex items-center rounded-lg bg-ember px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-card)] transition-transform hover:scale-[1.02]"
        >
          Go to Install
        </Link>
      </div>
    </div>
  );
}
