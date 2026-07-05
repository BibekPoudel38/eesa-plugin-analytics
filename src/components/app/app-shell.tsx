"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, ChevronDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "./nav";
import { workspace } from "@/lib/mock/data";
import { ContourMark, Wordmark } from "@/components/brand/contour-mark";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center px-5">
        <Link href="/" onClick={onNavigate}>
          <Wordmark />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4">
        <p className="px-3 pb-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
          Analyze
        </p>
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-foreground/75 hover:bg-black/[0.04] hover:text-foreground",
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" />
                  )}
                  <Icon
                    className={cn(
                      "size-[1.05rem] shrink-0",
                      active ? "text-sidebar-primary" : "text-muted-foreground",
                    )}
                    strokeWidth={2}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3">
        <div className="rounded-xl border border-sidebar-border bg-card/60 p-3">
          <div className="flex items-center gap-2">
            <ContourMark size={20} />
            <span className="text-sm font-medium text-foreground">
              {workspace.plan} plan
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            8,214 of 10k monthly events used.
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-ember" style={{ width: "82%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onMenu}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* workspace switcher */}
      <button className="flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 text-left hover:bg-accent">
        <span className="grid size-7 place-items-center rounded-md bg-ember text-[0.8rem] font-bold text-primary-foreground">
          S
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-semibold text-foreground">
            {workspace.name}
          </span>
          <span className="block font-mono text-[0.68rem] text-muted-foreground">
            {workspace.domain}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search events, pages…"
            className="h-9 w-52 rounded-lg border border-input bg-card pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>

        <Select defaultValue={workspace.defaultRange}>
          <SelectTrigger className="gap-1.5 bg-card">
            <Calendar className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {workspace.ranges.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Avatar className="size-8 border border-border">
          <AvatarFallback className="bg-teal/12 text-xs font-semibold text-teal">
            SK
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border lg:block">
        <SidebarBody />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
          {children}
        </main>
      </div>
    </div>
  );
}
