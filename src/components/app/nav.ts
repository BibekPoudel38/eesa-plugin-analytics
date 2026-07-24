import {
  LayoutGrid,
  Users,
  Target,
  Clapperboard,
  Filter,
  Code2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string;
};

// Hrefs are under /app — the plugin's embedded UI mounts at that segment so the
// public tracker/ingest/health/manifest/mcp routes can stay at the root.
export const navItems: NavItem[] = [
  { href: "/app", label: "Overview", icon: LayoutGrid, hint: "Traffic & health at a glance" },
  { href: "/app/visitors", label: "Visitors", icon: Users, hint: "Everyone who's visited, with replays" },
  { href: "/app/heatmaps", label: "Heatmaps", icon: Target, hint: "Where clicks & attention pool" },
  { href: "/app/sessions", label: "Sessions", icon: Clapperboard, hint: "Replay real visits" },
  { href: "/app/funnels", label: "Funnels & events", icon: Filter, hint: "Conversion & event stream" },
];

export const setupItems: NavItem[] = [
  { href: "/app/install", label: "Install", icon: Code2, hint: "Add tracking to your site" },
];
