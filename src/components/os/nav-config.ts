import {
  LayoutDashboard,
  Calendar,
  CalendarDays,
  Bed,
  Sparkles,
  Users,
  Star,
  MessageSquare,
  Home,
  Compass,
  Newspaper,
  Image as ImageIcon,
  FolderOpen,
  Search,
  Megaphone,
  BarChart3,
  CreditCard,
  FileText,
  PieChart,
  UserCog,
  ShieldCheck,
  History,
  Bot,
  Settings,
  ClipboardCheck,
} from "lucide-react";
import { ListChecks, AlertTriangle, Activity, TrendingUp } from "lucide-react";
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
  { kind: "item", item: { id: "dashboard", label: "Dashboard", href: "/admin", icon: LayoutDashboard } },
  {
    kind: "group",
    group: {
      id: "operations",
      label: "Operations",
      icon: Calendar,
      items: [
        { id: "operations.dashboard", label: "Operations Centre", href: "/admin/operations", icon: LayoutDashboard },
        { id: "operations.reservations", label: "Reservations", href: "/admin/bookings", icon: Calendar },
        { id: "operations.calendar", label: "Calendar", href: "/admin/operations/calendar", icon: CalendarDays },
        { id: "operations.rooms", label: "Room Board", href: "/admin/operations/rooms", icon: Bed },
        { id: "operations.housekeeping", label: "Housekeeping", href: "/admin/operations/housekeeping", icon: ClipboardCheck },
        { id: "operations.tasks", label: "Tasks", href: "/admin/operations/tasks", icon: ListChecks },
        { id: "operations.alerts", label: "Alerts", href: "/admin/operations/alerts", icon: AlertTriangle },
        { id: "operations.timeline", label: "Live Timeline", href: "/admin/operations/timeline", icon: Activity },
        { id: "operations.front-desk", label: "Front Desk", href: "/admin/front-desk", icon: ClipboardCheck },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "guests",
      label: "Guests",
      icon: Users,
      items: [
        { id: "guests.crm", label: "Guest CRM", href: "/admin/guests/crm", icon: Users },
        { id: "guests.reviews", label: "Reviews", href: "/admin/reviews", icon: Star },
        { id: "guests.messages", label: "Messages", href: "/admin/guests/messages", icon: MessageSquare },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "content",
      label: "Content",
      icon: Newspaper,
      items: [
        { id: "content.homepage", label: "Homepage", href: "/admin/content/homepage", icon: Home },
        { id: "content.rooms", label: "Rooms", href: "/admin/content/rooms", icon: Bed },
        { id: "content.experiences", label: "Experiences", href: "/admin/content/experiences", icon: Compass },
        { id: "content.journal", label: "Journal", href: "/admin/content/journal", icon: Newspaper },
        { id: "content.gallery", label: "Gallery", href: "/admin/content/gallery", icon: ImageIcon },
        { id: "content.media", label: "Media Library", href: "/admin/content/media", icon: FolderOpen },
        { id: "content.brand", label: "Brand Centre", href: "/admin/content/brand", icon: Sparkles },
        { id: "content.calendar", label: "Content Calendar", href: "/admin/content/calendar", icon: CalendarDays },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "marketing",
      label: "Marketing",
      icon: Megaphone,
      items: [
        { id: "marketing.seo", label: "SEO", href: "/admin/marketing/seo", icon: Search },
        { id: "marketing.ai-assistant", label: "AI Assistant", href: "/admin/marketing/ai-assistant", icon: Bot },
        { id: "marketing.campaigns", label: "Campaigns", href: "/admin/marketing/campaigns", icon: Sparkles },
        { id: "marketing.analytics", label: "Analytics", href: "/admin/marketing/analytics", icon: BarChart3 },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "finance",
      label: "Finance",
      icon: CreditCard,
      items: [
        { id: "finance.dashboard", label: "Revenue Dashboard", href: "/admin/finance", icon: LayoutDashboard },
        { id: "finance.payments", label: "Payments", href: "/admin/finance/payments", icon: CreditCard },
        { id: "finance.invoices", label: "Invoices", href: "/admin/finance/invoices", icon: FileText },
        { id: "finance.analytics", label: "Analytics", href: "/admin/finance/analytics", icon: BarChart3 },
        { id: "finance.reconciliation", label: "Reconciliation", href: "/admin/finance/reconciliation", icon: ClipboardCheck },
        { id: "finance.pricing", label: "Rate & Pricing", href: "/admin/finance/pricing", icon: PieChart },
        { id: "finance.forecast", label: "Forecast", href: "/admin/finance/forecast", icon: Activity },
        { id: "finance.alerts", label: "Alerts", href: "/admin/finance/alerts", icon: AlertTriangle },
        { id: "finance.reports", label: "Reports", href: "/admin/finance/reports", icon: PieChart },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "staff",
      label: "Staff",
      icon: UserCog,
      items: [
        { id: "staff.users", label: "Users", href: "/admin/staff/users", icon: UserCog },
        { id: "staff.roles", label: "Roles", href: "/admin/staff/roles", icon: ShieldCheck },
        { id: "staff.activity", label: "Activity Log", href: "/admin/staff/activity", icon: History },
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
        { id: "automation.notifications", label: "Notifications", href: "/admin/automation/notifications", icon: AlertTriangle },
        { id: "automation.scheduled", label: "Scheduled Jobs", href: "/admin/automation/scheduled", icon: CalendarDays },
        { id: "automation.approvals", label: "Approvals", href: "/admin/automation/approvals", icon: ShieldCheck },
      ],
    },
  },
  {
    kind: "group",
    group: {
      id: "ai",
      label: "Mtoni AI",
      icon: Bot,
      items: [
        { id: "ai.command",   label: "Command Centre", href: "/admin/ai",           icon: Sparkles },
        { id: "ai.executive", label: "Executive Intelligence", href: "/admin/ai/executive", icon: LayoutDashboard },
        { id: "ai.guests",    label: "Guest Intelligence AI", href: "/admin/ai/guests", icon: Users },
        { id: "ai.revenue",   label: "Revenue Intelligence AI", href: "/admin/ai/revenue", icon: TrendingUp },
        { id: "ai.marketing", label: "Marketing Intelligence AI", href: "/admin/ai/marketing", icon: Megaphone },
        { id: "ai.governance", label: "Governance", href: "/admin/ai/governance", icon: ShieldCheck },
        { id: "ai.performance",label: "Performance", href: "/admin/ai/performance", icon: Activity },
        { id: "ai.audit",     label: "Audit",       href: "/admin/ai/audit", icon: History },
        { id: "ai.insights",  label: "Insights",       href: "/admin/ai/insights",  icon: BarChart3 },
        { id: "ai.knowledge", label: "Knowledge Base", href: "/admin/ai/knowledge", icon: FileText },
        { id: "ai.activity",  label: "AI Activity",    href: "/admin/ai/activity",  icon: History },
        { id: "ai.settings",  label: "Settings",       href: "/admin/ai/settings",  icon: Settings },
      ],
    },
  },
  { kind: "item", item: { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings } },
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