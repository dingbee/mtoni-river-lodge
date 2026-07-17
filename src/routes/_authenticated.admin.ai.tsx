import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Sparkles, BarChart3, FileText, History, Settings, Users, TrendingUp, Megaphone, LayoutDashboard, ShieldCheck, Activity, Search, MessageCircle, Inbox, Brain, Plane, MessagesSquare, PenSquare, AlertTriangle, Radio, LineChart, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({ meta: [{ title: "Mtoni AI — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiLayout,
});

const TABS = [
  { to: "/admin/ai",           label: "Command Centre", icon: Sparkles, exact: true },
  { to: "/admin/ai/executive", label: "Executive Intelligence", icon: LayoutDashboard },
  { to: "/admin/ai/guests",    label: "Guest Intelligence AI", icon: Users },
  { to: "/admin/ai/revenue",   label: "Revenue Intelligence AI", icon: TrendingUp },
  { to: "/admin/ai/marketing", label: "Marketing Intelligence AI", icon: Megaphone },
  { to: "/admin/ai/operations", label: "Operations AI", icon: ClipboardList },
  { to: "/admin/ai/concierge", label: "AI Concierge",       icon: MessageCircle },
  { to: "/admin/ai/concierge/analytics", label: "Concierge Analytics", icon: LineChart },
  { to: "/admin/ai/concierge/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/admin/ai/concierge/drafts", label: "Drafts", icon: PenSquare },
  { to: "/admin/ai/concierge/escalations", label: "Escalations", icon: AlertTriangle },
  { to: "/admin/ai/concierge/channels", label: "Channels", icon: Radio },
  { to: "/admin/ai/concierge/memory", label: "Guest Memory", icon: Brain },
  { to: "/admin/ai/concierge/pre-arrival", label: "Pre-Arrival", icon: Plane },
  { to: "/admin/ai/concierge/recommendations", label: "Recommendations", icon: Sparkles },
  { to: "/admin/ai/leads",     label: "Concierge Leads",    icon: Inbox },
  { to: "/admin/ai/governance",label: "Governance",     icon: ShieldCheck },
  { to: "/admin/ai/performance",label:"Performance",    icon: Activity },
  { to: "/admin/ai/audit",     label: "Audit",          icon: Search },
  { to: "/admin/ai/insights",  label: "Insights",       icon: BarChart3 },
  { to: "/admin/ai/knowledge", label: "Knowledge Base", icon: FileText },
  { to: "/admin/ai/knowledge/sync", label: "Knowledge Sync", icon: RefreshCw },
  { to: "/admin/ai/activity",  label: "AI Activity",    icon: History },
  { to: "/admin/ai/settings",  label: "Settings",       icon: Settings },
] as const;

function AiLayout() {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to as any}
            activeOptions={{ exact: (t as any).exact ?? false }}
            activeProps={{ className: "bg-primary text-primary-foreground" }}
            inactiveProps={{ className: "text-muted-foreground hover:bg-muted" }}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5"
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}