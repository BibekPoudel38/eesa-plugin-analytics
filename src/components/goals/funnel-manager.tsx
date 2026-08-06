"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Filter, X } from "lucide-react";
import { ruleText } from "@/components/dashboard/goal-tile";
import type { GoalKind, GoalOperator } from "@/lib/goals/compute";
import { cn } from "@/lib/utils";

/**
 * Define the site's funnels.
 *
 * A step is a LABEL + the same rule a conversion card uses, so the vocabulary
 * is learned once. Steps are ordered and monotonic: each one narrows the
 * sessions that passed the previous, which is why they can be dragged in
 * meaning but not in effect — order is the funnel.
 */

export interface FunnelStepRow {
  label: string;
  kind: GoalKind;
  operator: GoalOperator;
  value: string;
}
export interface FunnelRow {
  id: string;
  name: string;
  steps: FunnelStepRow[];
}

const blankStep = (): FunnelStepRow => ({
  label: "",
  kind: "path",
  operator: "contains",
  value: "",
});

export function FunnelManager({ siteId, initial }: { siteId: string; initial: FunnelRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<FunnelRow[]>(initial);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<FunnelStepRow[]>([blankStep(), blankStep()]);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const qs = `?site=${encodeURIComponent(siteId)}`;
  const patchStep = (i: number, p: Partial<FunnelStepRow>) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const ready =
    name.trim() !== "" && steps.every((s) => s.label.trim() && s.value.trim());

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/funnels${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, steps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save the funnel.");
      setRows((r) => [...r, data.funnel]);
      setName("");
      setSteps([blankStep(), blankStep()]);
      router.refresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/funnels/${id}${qs}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not remove the funnel.");
      }
      setRows((r) => r.filter((x) => x.id !== id));
      router.refresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {err && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}

      <form onSubmit={create} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Funnel name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Browse → Order"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ember"
          />
        </label>

        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">
            Steps <span className="opacity-60">— in order; each narrows the one before</span>
          </span>
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              <input
                value={s.label}
                onChange={(e) => patchStep(i, { label: e.target.value })}
                placeholder="Reached checkout"
                className="min-w-[9rem] flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ember"
              />
              <select
                value={s.kind}
                onChange={(e) => {
                  const kind = e.target.value as GoalKind;
                  patchStep(i, { kind, ...(kind === "event" ? { operator: "exact" as GoalOperator } : {}) });
                }}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
              >
                <option value="path">Page</option>
                <option value="event">Event</option>
              </select>
              {s.kind === "path" && (
                <select
                  value={s.operator}
                  onChange={(e) => patchStep(i, { operator: e.target.value as GoalOperator })}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none"
                >
                  <option value="contains">contains</option>
                  <option value="starts_with">starts with</option>
                  <option value="exact">is exactly</option>
                </select>
              )}
              <input
                value={s.value}
                onChange={(e) => patchStep(i, { value: e.target.value })}
                placeholder={s.kind === "event" ? "purchase" : "/checkout"}
                className="min-w-[8rem] flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-sm outline-none focus:border-ember"
              />
              {/* A funnel needs at least two steps to be a funnel. */}
              {steps.length > 2 && (
                <button
                  type="button"
                  onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                  aria-label={`Remove step ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSteps((s) => [...s, blankStep()])}
            disabled={steps.length >= 12}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Plus className="size-3.5" /> Add step
          </button>
        </div>

        <button
          type="submit"
          disabled={busy || !ready}
          className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create funnel
        </button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Filter className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">No funnels yet</p>
            <p className="text-xs text-muted-foreground">
              The Funnels page shows the first one you create here.
            </p>
          </div>
        ) : (
          rows.map((f) => (
            <div key={f.id} className={cn("rounded-xl border border-border bg-card px-4 py-3")}>
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{f.name}</p>
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  disabled={busyId === f.id}
                  className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
                  aria-label={`Delete ${f.name}`}
                >
                  {busyId === f.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </button>
              </div>
              <ol className="mt-1.5 space-y-0.5">
                {f.steps.map((s, i) => (
                  <li key={i} className="truncate font-mono text-xs text-muted-foreground">
                    {i + 1}. {s.label} — {ruleText(s)}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
