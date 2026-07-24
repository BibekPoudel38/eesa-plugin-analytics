"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, setupItems, type NavItem } from "./nav";
import { Wordmark } from "@/components/brand/contour-mark";
import { SidebarCapture } from "@/components/app/sidebar-capture";
import { SiteSwitcher } from "@/components/app/site-switcher";
import type { Site } from "@/lib/db/sites";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { RangeSelect } from "@/components/app/range-filter";

function isActive(pathname: string, href: string) {
  // Overview is exactly /app; the rest match by prefix.
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <p className="px-3 pb-2 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[var(--shadow-card)]"
                    : "text-foreground/70 hover:bg-foreground/[0.045] hover:text-foreground",
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
    </>
  );
}

function SidebarBody({
  onNavigate,
  sites,
  activeSiteId,
}: {
  onNavigate?: () => void;
  sites: Site[];
  activeSiteId: string | null;
}) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-sidebar to-sidebar/70">
      <div className="flex h-14 items-center px-5">
        <Link
          href="/app"
          onClick={onNavigate}
          className="rounded-lg transition-opacity hover:opacity-80"
        >
          <Wordmark />
        </Link>
      </div>

      <div className="px-3 pb-2">
        <SiteSwitcher sites={sites} activeSiteId={activeSiteId} />
      </div>

      <nav className="flex-1 px-3 py-4 pt-2">
        <NavGroup label="Analyze" items={navItems} pathname={pathname} onNavigate={onNavigate} />
        <div className="mt-5">
          <NavGroup label="Setup" items={setupItems} pathname={pathname} onNavigate={onNavigate} />
        </div>
      </nav>

      <div className="p-3">
        <SidebarCapture
          siteId={activeSiteId}
          domain={
            (sites.find((s) => s.id === activeSiteId) ?? sites[0])?.domain || null
          }
        />
      </div>
    </div>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
      <button
        onClick={onMenu}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <AutoRefresh />
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search events, pages…"
            className="h-9 w-52 rounded-lg border border-input bg-card/70 pl-8 pr-3 text-sm shadow-[var(--shadow-card)] outline-none transition-all placeholder:text-muted-foreground focus-visible:w-64 focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>

        <RangeSelect />

        <Avatar className="size-8 border border-border">
          <AvatarFallback className="bg-teal/12 text-xs font-semibold text-teal">
            SK
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}

export function AppShell({
  children,
  sites,
  activeSiteId,
}: {
  children: React.ReactNode;
  sites: Site[];
  activeSiteId: string | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border/80 lg:block">
        <SidebarBody sites={sites} activeSiteId={activeSiteId} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody
            onNavigate={() => setMobileOpen(false)}
            sites={sites}
            activeSiteId={activeSiteId}
          />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
