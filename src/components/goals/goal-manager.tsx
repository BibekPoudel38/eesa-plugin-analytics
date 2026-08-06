"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Eye, EyeOff, Target } from "lucide-react";
import { ruleText } from "@/components/dashboard/goal-tile";
import type { GoalKind, GoalOperator } from "@/lib/goals/compute";
import { cn } from "@/lib/utils";

/**
 * Create / edit / remove the tenant's conversion cards.
 *
 * Deliberately plain: whoever sets a site up is an IT person doing this once,
 * not a daily user. The value is that every field maps 1:1 to the stored rule,
 * so what they typed is what the card counts — no hidden normalisation, and a
 * live preview sentence of the rule underneath.
 */

export interface GoalRow {
  id: string;
  name: string;
  kind: GoalKind;
  operator: GoalOperator;
  value: string;
  icon: string;
  active: boolean;
}

const KINDS: { v: GoalKind; label: string; hint: string }[] = [
  { v: "path", label: "Page", hint: "Someone reached a page on this site" },
  { v: "event", label: "Event", hint: "Your site fired a custom event" },
];
const OPS: { v: GoalOperator; label: string }[] = [
  { v: "contains", label: "contains" },
  { v: "starts_with", label: "starts with" },
  { v: "exact", label: "is exactly" },
];

export function GoalManager({ siteId, initial }: { siteId: string; initial: GoalRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<GoalRow[]>(initial);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GoalKind>("path");
  const [operator, setOperator] = useState<GoalOperator>("contains");
  const [value, setValue] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const qs = `?site=${encodeURIComponent(siteId)}`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim() || !value.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/goals${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, operator, value, icon }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save the card.");
      setRows((r) => [...r, data.goal]);
      setName("");
      setValue("");
      setIcon("");
      router.refresh(); // the overview reads these server-side
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/goals/${id}${qs}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not update the card.");
      setRows((r) => r.map((x) => (x.id === id ? data.goal : x)));
      router.refresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/goals/${id}${qs}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Could not remove the card.");
      }
      setRows((r) => r.filter((x) => x.id !== id));
      router.refresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const preview = value.trim()
    ? ruleText({ kind, operator, value: value.trim() })
    : kind === "event"
      ? "event …"
      : "path …";

  return (
    <div className="space-y-6">
      {err && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </p>
      )}

      {/* create */}
      <form
        onSubmit={create}
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Card name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Burrito"
              maxLength={60}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Icon <span className="opacity-60">(optional lucide name)</span>
            </span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="ShoppingCart"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Count a session when…</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-border">
              {KINDS.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  title={k.hint}
                  onClick={() => {
                    setKind(k.v);
                    if (k.v === "event") setOperator("exact");
                  }}
                  className={cn(
                    "px-3 py-2 text-sm transition-colors",
                    kind === k.v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>

            {/* An event is matched by exact name, so no operator is offered —
                a partial event match would fold "signup_failed" into "signup". */}
            {kind === "path" && (
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as GoalOperator)}
                className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-ember"
              >
                {OPS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}

            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === "event" ? "purchase" : "/menu/burrito"}
              className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ember"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Counts sessions where <span className="font-mono text-foreground">{preview}</span>
            {kind === "event" && (
              <>
                {" "}— fire it with{" "}
                <span className="font-mono text-foreground">
                  eesa(&apos;event&apos;, &apos;{value.trim() || "purchase"}&apos;)
                </span>
              </>
            )}
          </p>
        </div>

        <button
          type="submit"
          disabled={busy || !name.trim() || !value.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add card
        </button>
      </form>

      {/* existing */}
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Target className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">No conversion cards yet</p>
            <p className="text-xs text-muted-foreground">
              Add one above and it appears on the Overview immediately.
            </p>
          </div>
        ) : (
          rows.map((g) => (
            <div
              key={g.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
                !g.active && "opacity-60",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{g.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{ruleText(g)}</p>
              </div>
              <button
                type="button"
                onClick={() => patch(g.id, { active: !g.active })}
                disabled={busyId === g.id}
                title={g.active ? "Hide this card" : "Show this card"}
                className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {g.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => remove(g.id)}
                disabled={busyId === g.id}
                title="Delete this card"
                className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
              >
                {busyId === g.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
