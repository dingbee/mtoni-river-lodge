import {
  LayoutDashboard,
  Calendar,
  Bed,
  ClipboardCheck,
  Users,
  CreditCard,
  FileText,
  PieChart,
  Bot,
  Settings,
  Activity,
  ShieldCheck,
  UserCog,
  History,
  MessageSquare,
  Sparkles,
  TrendingUp,
  MessageCircle,
  Brain,
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
  { kind: "item", item: { id: "dashboard", label: "Overview", href: "/admin", icon: LayoutDashboard } },
  { kind: "item", item: { id: "reservations", label: "Reservations", href: "/admin/bookings", icon: Calendar } },
  { kind: "item", item: { id: "rooms", label: "Rooms", href: "/admin/operations/rooms", icon: Bed } },
  { kind: "item", item: { id: "front-desk", label: "Front Desk", href: "/admin/front-desk", icon: ClipboardCheck } },
  {
    kind: "group",
    group: {
      id: "operations",
      label: "Operations",
      icon: Activity,
      items: [
        { id: "operations.dashboard", label: "Overview", href: "/admin/operations", icon: LayoutDashboard },
        { id: "operations.arrivals", label: "Arrivals", href: "/admin/operations/arrivals", icon: Users },
        { id: "operations.calendar", label: "Calendar", href: "/admin/calendar", icon: Calendar },
        { id: "operations.tasks", label: "Tasks", href: "/admin/operations/tasks", icon: ClipboardCheck },
        { id: "operations.alerts", label: "Alerts", href: "/admin/operations/alerts", icon: MessageSquare },
        { id: "operations.timeline", label: "Live Timeline", href: "/admin/operations/timeline", icon: History },
      ],
    },
  },
  { kind: "item", item: { id: "housekeeping", label: "Housekeeping", href: "/admin/operations/housekeeping", icon: ClipboardCheck } },
  { kind: "item", item: { id: "guests", label: "Guests", href: "/admin/guests/crm", icon: Users } },
  {
    kind: "group",
    group: {
      id: "finance",
      label: "Finance",
      icon: CreditCard,
      items: [
        { id: "finance.overview", label: "Overview", href: "/admin/finance", icon: LayoutDashboard },
        { id: "finance.payments", label: "Payments", href: "/admin/finance/payments", icon: CreditCard },
        { id: "finance.invoices", label: "Invoices", href: "/admin/finance/invoices", icon: FileText },
        { id: "finance.reconciliation", label: "Reconciliation", href: "/admin/finance/reconciliation", icon: ClipboardCheck },
        { id: "finance.reports", label: "Reports", href: "/admin/finance/reports", icon: PieChart },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "revenue",
      label: "Revenue",
      icon: TrendingUp,
      items: [
        { id: "revenue.analytics", label: "Performance", href: "/admin/analytics/revenue", icon: TrendingUp },
        { id: "revenue.pricing", label: "Rate & Pricing", href: "/admin/finance/pricing", icon: PieChart },
        { id: "revenue.forecast", label: "Forecast", href: "/admin/finance/forecast", icon: Activity },
        { id: "revenue.reports", label: "Reports", href: "/admin/finance/reports", icon: FileText },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "automation",
      label: "Automation",
      icon: Bot,
      items: [
        { id: "automation.overview", label: "Overview", href: "/admin/automation", icon: LayoutDashboard },
        { id: "automation.workflows", label: "Workflows", href: "/admin/automation/workflows", icon: Bot },
        { id: "automation.monitor", label: "Monitor", href: "/admin/automation/monitor", icon: Activity },
        { id: "automation.notifications", label: "Notifications", href: "/admin/automation/notifications", icon: MessageSquare },
        { id: "automation.scheduled", label: "Scheduled Jobs", href: "/admin/automation/scheduled", icon: Calendar },
        { id: "automation.approvals", label: "Approvals", href: "/admin/automation/approvals", icon: ShieldCheck },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "ai",
      label: "StayNas AI",
      icon: Sparkles,
      items: [
        { id: "ai.concierge", label: "Concierge", href: "/admin/ai/concierge", icon: MessageCircle },
        { id: "ai.guests", label: "Guest Intelligence", href: "/admin/ai/guests", icon: Users },
        { id: "ai.operations", label: "Operations Intelligence", href: "/admin/ai/operations", icon: Activity },
        { id: "ai.revenue", label: "Revenue Intelligence", href: "/admin/ai/revenue", icon: TrendingUp },
        { id: "ai.executive", label: "Executive Intelligence", href: "/admin/ai/executive", icon: Brain },
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
        { id: "system.health", label: "System Health", href: "/admin/system/health", icon: Activity },
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
      const item = entry.group.items.find((i) => i.href === href);
      if (item) return { group: entry.group, item };
    }
  }
  return {};
}
