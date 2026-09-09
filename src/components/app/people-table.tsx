"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

import { compactNumber, formatPhone } from "@/lib/format";

/**
 * 179 rows of people, made usable.
 *
 * The server sends the whole list once — it is a few hundred rows, and paging
 * it would cost a round trip per interaction to save nothing. Everything here
 * is local: search, sort, and the four segments, so the table answers "who
 * came back", "who ordered once", "who never ordered" without a reload.
 *
 * Sorting defaults to spend because that is the order the page is about, but a
 * restaurant looking for people to win back wants "browsing, by last seen" —
 * two clicks, not a different page.
 */

export interface PersonRow {
  userId: string;
  sessions: number;
  screens: number;
  carted: number;
  orders: number;
  spend: number;
  firstSeen: string;
  lastSeen: string;
  platform: string;
  topItem: string;
  service: string;
  customer: {
    name: string; phone: string; email: string;
    city: string; status: string; since: string;
  } | null;
}

type SortKey = "spend" | "orders" | "carted" | "sessions" | "screens" | "lastSeen" | "name";
type Segment = "all" | "repeat" | "once" | "browsing";

const SEGMENTS: { key: Segment; label: string; hint: string }[] = [
  { key: "all", label: "Everyone", hint: "Every person the app named" },
  { key: "repeat", label: "Came back", hint: "More than one order" },
  { key: "once", label: "Ordered once", hint: "Exactly one order" },
  { key: "browsing", label: "Never ordered", hint: "Signed in, no order yet" },
];

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function ago(iso: string): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "—";
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

function day(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2.5 align-middle";

function SortHead({
  label, k, sort, dir, onSort, align = "left",
}: {
  label: string; k: SortKey; sort: SortKey; dir: 1 | -1;
  onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = sort === k;
  return (
    <th className={`${TH} ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
        aria-sort={active ? (dir === -1 ? "descending" : "ascending") : "none"}
      >
        {label}
        <span className={active ? "" : "opacity-0"}>{dir === -1 ? "↓" : "↑"}</span>
      </button>
    </th>
  );
}

export function PeopleTable({ rows }: { rows: PersonRow[] }) {
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Segment>("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [dir, setDir] = useState<1 | -1>(-1);

  const counts = useMemo(() => ({
    all: rows.length,
    repeat: rows.filter((r) => r.orders > 1).length,
    once: rows.filter((r) => r.orders === 1).length,
    browsing: rows.filter((r) => r.orders === 0).length,
  }), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Digits-only so a search for "562 290" finds "(562) 290-3724".
    const digits = needle.replace(/\D/g, "");
    let out = rows.filter((r) => {
      if (seg === "repeat" && r.orders <= 1) return false;
      if (seg === "once" && r.orders !== 1) return false;
      if (seg === "browsing" && r.orders !== 0) return false;
      if (!needle) return true;
      const c = r.customer;
      return (
        r.userId.toLowerCase().includes(needle) ||
        (c?.name ?? "").toLowerCase().includes(needle) ||
        (c?.email ?? "").toLowerCase().includes(needle) ||
        (c?.city ?? "").toLowerCase().includes(needle) ||
        r.topItem.toLowerCase().includes(needle) ||
        (digits.length >= 3 && (c?.phone ?? "").replace(/\D/g, "").includes(digits))
      );
    });
    const val = (r: PersonRow) =>
      sort === "name" ? (r.customer?.name || r.userId).toLowerCase()
      : sort === "lastSeen" ? Date.parse(r.lastSeen) || 0
      : r[sort];
    out = [...out].sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === "string" || typeof y === "string") {
        return String(x).localeCompare(String(y)) * dir;
      }
      return ((x as number) - (y as number)) * dir;
    });
    return out;
  }, [rows, q, seg, sort, dir]);

  function onSort(k: SortKey) {
    if (k === sort) { setDir((d) => (d === -1 ? 1 : -1)); return; }
    setSort(k);
    // Names read A–Z; every number reads biggest-first.
    setDir(k === "name" ? 1 : -1);
  }

  function exportCsv() {
    const head = ["Name", "Customer id", "Phone", "Email", "City", "Platform",
      "Favourite", "Service", "Visits", "Screens", "Added", "Orders", "Spend",
      "First seen", "Last seen"];
    const cell = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = shown.map((r) => [
      r.customer?.name ?? "", r.userId, r.customer?.phone ?? "",
      r.customer?.email ?? "", r.customer?.city ?? "", r.platform,
      r.topItem, r.service, r.sessions, r.screens, r.carted, r.orders,
      r.spend.toFixed(2), r.firstSeen.slice(0, 10), r.lastSeen.slice(0, 10),
    ].map(cell).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `app-people-${seg}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              title={s.hint}
              onClick={() => setSeg(s.key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                seg === s.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s.label}
              <span className="ml-1.5 tabular opacity-70">{counts[s.key]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, phone, email, dish…"
              aria-label="Search people"
              className="h-8 w-56 rounded-lg border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={exportCsv}
            title={`Download ${shown.length} rows as CSV`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-muted"
          >
            <Download className="size-3.5" />
            Export
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <SortHead label="Person" k="name" sort={sort} dir={dir} onSort={onSort} />
              <th className={TH}>Contact</th>
              <th className={TH}>City</th>
              <th className={TH}>Usually orders</th>
              <SortHead label="Visits" k="sessions" sort={sort} dir={dir} onSort={onSort} align="right" />
              <SortHead label="Screens" k="screens" sort={sort} dir={dir} onSort={onSort} align="right" />
              <SortHead label="Added" k="carted" sort={sort} dir={dir} onSort={onSort} align="right" />
              <SortHead label="Orders" k="orders" sort={sort} dir={dir} onSort={onSort} align="right" />
              <SortHead label="Spend" k="spend" sort={sort} dir={dir} onSort={onSort} align="right" />
              <SortHead label="Last seen" k="lastSeen" sort={sort} dir={dir} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((r) => (
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
                    <a href={`tel:${r.customer.phone}`} className="tabular text-foreground hover:underline">
                      {formatPhone(r.customer.phone)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {r.customer?.email && (
                    <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {r.customer.email}
                    </div>
                  )}
                </td>
                <td className={`${TD} text-muted-foreground`}>{r.customer?.city || "—"}</td>
                <td className={TD}>
                  {r.topItem ? (
                    <>
                      <div className="max-w-[190px] truncate text-foreground">{r.topItem}</div>
                      {r.service && (
                        <div className="text-xs capitalize text-muted-foreground">{r.service}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`${TD} text-right tabular`}>{r.sessions}</td>
                <td className={`${TD} text-right tabular`}>{compactNumber(r.screens)}</td>
                <td className={`${TD} text-right tabular`}>{r.carted || "—"}</td>
                <td className={`${TD} text-right tabular`}>{r.orders || "—"}</td>
                <td className={`${TD} text-right tabular font-medium text-foreground`}>
                  {r.spend ? money(r.spend) : "—"}
                </td>
                <td className={`${TD} text-right text-xs text-muted-foreground`}>{ago(r.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!shown.length && (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nobody matches {q ? <>“{q}”</> : "this filter"}.
        </p>
      )}
      <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
        Showing {compactNumber(shown.length)} of {compactNumber(rows.length)} · Export
        downloads exactly what is on screen.
      </p>
    </div>
  );
}
