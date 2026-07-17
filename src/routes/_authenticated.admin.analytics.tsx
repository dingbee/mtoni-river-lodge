import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Calendar, Globe, TrendingUp, Megaphone, ClipboardCheck, Bot, Crown, FileText, LineChart, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics & Intelligence Hub — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AnalyticsLayout,
});

const TABS = [
  { to: "/admin/analytics", label: "Hub", icon: LayoutDashboard, exact: true },
  { to: "/admin/analytics/bookings", label: "Bookings", icon: Calendar },
  { to: "/admin/analytics/website", label: "Website", icon: Globe },
  { to: "/admin/analytics/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/admin/analytics/marketing", label: "Marketing", icon: Megaphone },
  { to: "/admin/analytics/operations", label: "Operations", icon: ClipboardCheck },
  { to: "/admin/analytics/ai", label: "AI", icon: Bot },
  { to: "/admin/analytics/executive", label: "Executive", icon: Crown },
  { to: "/admin/analytics/trends", label: "Trends", icon: LineChart },
  { to: "/admin/analytics/recommendations", label: "Recommendations", icon: Sparkles },
  { to: "/admin/analytics/reports", label: "Reports", icon: FileText },
] as const;

function AnalyticsLayout() {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to as any}
            activeOptions={{ exact: (t as any).exact ?? false }}
            activeProps={{ className: "bg-primary text-primary-foreground" }}
            inactiveProps={{ className: "text-muted-foreground hover:bg-muted" }}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5">
            <t.icon className="size-4" /> {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
