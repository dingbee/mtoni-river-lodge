import {
  Activity,
  Bed,
  Bot,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavGroup = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  items: NavItem[];
};

export type NavEntry =
  | { kind: "item"; item: NavItem }
  | { kind: "group"; group: NavGroup };

export const NAV: NavEntry[] = [
  { kind: "item", item: { id: "overview", label: "Overview", href: "/admin", icon: LayoutDashboard } },
  { kind: "item", item: { id: "reservations", label: "Reservations", href: "/admin/bookings", icon: Calendar } },
  { kind: "item", item: { id: "rooms", label: "Rooms", href: "/admin/operations/rooms", icon: Bed } },
  { kind: "item", item: { id: "front-desk", label: "Front Desk", href: "/admin/front-desk", icon: ClipboardCheck } },
  { kind: "item", item: { id: "operations", label: "Operations", href: "/admin/operations", icon: Activity } },
  { kind: "item", item: { id: "housekeeping", label: "Housekeeping", href: "/admin/operations/housekeeping", icon: CheckCircle2 } },
  { kind: "item", item: { id: "guests", label: "Guests", href: "/admin/guests/crm", icon: Users } },
  { kind: "item", item: { id: "finance", label: "Finance", href: "/admin/finance", icon: CreditCard } },
  { kind: "item", item: { id: "revenue", label: "Revenue", href: "/admin/analytics/revenue", icon: TrendingUp } },
  { kind: "item", item: { id: "automation", label: "Automation", href: "/admin/automation", icon: Bot } },
  {
    kind: "group",
    group: {
      id: "ai",
      label: "StayNas AI",
      icon: Bot,
      items: [
        { id: "ai.concierge", label: "Concierge", href: "/admin/ai/concierge", icon: Bot },
        { id: "ai.guests", label: "Guest Intelligence", href: "/admin/ai/guests", icon: Users },
        { id: "ai.operations", label: "Operations Intelligence", href: "/admin/ai/operations", icon: Activity },
        { id: "ai.revenue", label: "Revenue Intelligence", href: "/admin/ai/revenue", icon: TrendingUp },
        { id: "ai.executive", label: "Executive Intelligence", href: "/admin/ai/executive", icon: LayoutDashboard },
      ],
    },
  },
  { kind: "item", item: { id: "knowledge", label: "Knowledge", href: "/admin/ai/knowledge", icon: FileText } },
  {
    kind: "group",
    group: {
      id: "system",
      label: "System",
      icon: Settings,
      items: [
        { id: "system.health", label: "Health", href: "/admin/system/health", icon: Activity },
        { id: "system.information", label: "System Information", href: "/admin/system/nova", icon: Wrench },
        { id: "system.users", label: "Users", href: "/admin/staff/users", icon: UserCog },
        { id: "system.roles", label: "Roles", href: "/admin/staff/roles", icon: ShieldCheck },
        { id: "system.activity", label: "Activity Log", href: "/admin/staff/activity", icon: History },
        { id: "system.settings", label: "Settings", href: "/admin/settings", icon: Settings },
      ],
    },
  },
];

export function findNavByHref(href: string): { group?: NavGroup; item?: NavItem } {
  for (const entry of NAV) {
    if (entry.kind === "item" && entry.item.href === href) return { item: entry.item };
    if (entry.kind === "group") {
      const item = entry.group.items.find((i) => href === i.href || href.startsWith(i.href + "/"));
      if (item) return { group: entry.group, item };
    }
  }
  return {};
}
