import { Clapperboard, Code2, Contact, Filter, Goal, LayoutGrid, Radio, Smartphone, Target, Users, type LucideIcon } from "lucide-react";

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
  { href: "/app/surfaces", label: "Web & app", icon: Radio, hint: "Which surface the traffic came from" },
  { href: "/app/mobile", label: "App", icon: Smartphone, hint: "Everything the mobile app reports" },
  { href: "/app/people", label: "People", icon: Contact, hint: "Who is using the app, by name" },
  { href: "/app/visitors", label: "Visitors", icon: Users, hint: "Everyone who's visited, with replays" },
  { href: "/app/heatmaps", label: "Heatmaps", icon: Target, hint: "Where clicks & attention pool" },
  { href: "/app/sessions", label: "Sessions", icon: Clapperboard, hint: "Replay real visits" },
  { href: "/app/funnels", label: "Funnels & events", icon: Filter, hint: "Conversion & event stream" },
];

export const setupItems: NavItem[] = [
  { href: "/app/goals", label: "Conversion cards", icon: Goal, hint: "Define what counts as a conversion" },
  { href: "/app/install", label: "Install", icon: Code2, hint: "Add tracking to your site" },
];
