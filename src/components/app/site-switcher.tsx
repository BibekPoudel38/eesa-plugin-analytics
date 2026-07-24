"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check, Globe, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Site } from "@/lib/db/sites";

function initials(name: string) {
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "S";
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-ember to-[var(--amber)] font-bold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Real, tenant-scoped site switcher. Sites come from the server (verified);
 * selecting one persists to the `eesa_site` cookie via /api/session/set and
 * refreshes so the scoped server components re-render. "Add website" creates a
 * real site (with its own tracking key) via POST /api/sites.
 */
export function SiteSwitcher({
  sites,
  activeSiteId,
}: {
  sites: Site[];
  activeSiteId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const active = sites.find((s) => s.id === activeSiteId) ?? sites[0] ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function selectSite(id: string) {
    setOpen(false);
    if (id === active?.id) return;
    await fetch("/api/session/set", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site: id }),
    });
    router.refresh();
  }

  async function addSite() {
    const nm = name.trim();
    if (!nm || busy) return;
    setBusy(true);
    try {
      const domain = url.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nm, domain }),
      });
      if (res.ok) {
        const { site } = (await res.json()) as { site: Site };
        await fetch("/api/session/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ site: site.id }),
        });
        setName("");
        setUrl("");
        setAdding(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-card/70 px-2.5 py-2 text-left shadow-[var(--shadow-card)] transition-colors hover:border-border"
      >
        <Avatar name={active?.name ?? "Site"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {active?.name ?? "No site yet"}
          </span>
          <span className="block truncate font-mono text-[0.62rem] text-muted-foreground">
            {active?.domain || "add your first site →"}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-pop)]">
          <p className="px-2 py-1.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
            Websites
          </p>
          <ul className="max-h-64 overflow-y-auto">
            {sites.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => selectSite(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent",
                    s.id === active?.id && "bg-accent/60",
                  )}
                >
                  <Avatar name={s.name} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{s.name}</span>
                    <span className="block truncate font-mono text-[0.6rem] text-muted-foreground">
                      {s.domain || "—"}
                    </span>
                  </span>
                  {s.id === active?.id && <Check className="size-4 shrink-0 text-ember" />}
                </button>
              </li>
            ))}
            {!sites.length && (
              <li className="px-2 py-2 text-xs text-muted-foreground">No sites yet.</li>
            )}
          </ul>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => {
              setOpen(false);
              setAdding(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <span className="grid size-6 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
              <Plus className="size-3.5" />
            </span>
            Add website
          </button>
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-pop)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-ember/12 text-ember">
                  <Globe className="size-4" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Add a website</h3>
              </div>
              <button
                onClick={() => setAdding(false)}
                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Website name
                </span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSite()}
                  placeholder="e.g. Acme Store"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  URL <span className="text-muted-foreground/60">(optional)</span>
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSite()}
                  placeholder="https://acme.com"
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25"
                />
              </label>
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-[0.68rem] text-muted-foreground">
                A unique tracking snippet is generated for each site — copy it from
                the Install page after adding.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setAdding(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={addSite}
                disabled={!name.trim() || busy}
                className="rounded-lg bg-ember px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-card)] transition-transform hover:scale-[1.02] disabled:opacity-40"
              >
                {busy ? "Adding…" : "Add website"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
