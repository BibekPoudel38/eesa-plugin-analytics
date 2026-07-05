import { LayoutGrid, Target, Clapperboard, Filter, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  hint: string;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, hint: "Traffic & health at a glance" },
  { href: "/heatmaps", label: "Heatmaps", icon: Target, hint: "Where clicks & attention pool" },
  { href: "/sessions", label: "Sessions", icon: Clapperboard, hint: "Replay real visits" },
  { href: "/funnels", label: "Funnels & events", icon: Filter, hint: "Conversion & event stream" },
];
