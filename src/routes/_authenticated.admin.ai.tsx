import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Sparkles, BarChart3, FileText, History, Settings, Users, TrendingUp, Megaphone, LayoutDashboard, ShieldCheck, Activity, Search, MessageCircle, Inbox, Brain, Plane, MessagesSquare, PenSquare, AlertTriangle, Radio, LineChart, ClipboardList, RefreshCw, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({ meta: [{ title: "StayNas AI — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiLayout,
});

const TABS = [
  { to: "/admin/ai", label: "Command Centre", icon: Sparkles, exact: true },
  { to: "/admin/ai/copilot", label: "Staff Copilot", icon: Bot },
  { to: "/admin/ai/executive", label: "Executive", icon: LayoutDashboard },
  { to: "/admin/ai/guests", label: "Guest Intelligence", icon: Users },
  { to: "/admin/ai/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/admin/ai/marketing", label: "Marketing", icon: Megaphone },
  { to: "/admin/ai/operations", label: "Operations", icon: ClipboardList },
  { to: "/admin/ai/concierge", label: "Concierge", icon: MessageCircle },
  { to: "/admin/ai/knowledge", label: "Knowledge", icon: FileText },
  { to: "/admin/ai/insights", label: "Insights", icon: BarChart3 },
] as const;

function AiLayout() {
  return (
    <div className="space-y-4">
      <nav aria-label="StayNas AI workspace" className="os-context-nav">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to as any}
            activeOptions={{ exact: (t as any).exact ?? false }}
            activeProps={{ "data-context-active": "true" }}
            className="os-context-nav__item"
          >
            <t.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}