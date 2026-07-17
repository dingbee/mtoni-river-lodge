import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, TrendingUp, DollarSign, Sparkles, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue")({
  head: () => ({ meta: [{ title: "Revenue Intelligence AI — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RevenueAiLayout,
});

const TABS = [
  { to: "/admin/ai/revenue",              label: "Dashboard",     icon: LayoutDashboard, exact: true },
  { to: "/admin/ai/revenue/forecast",     label: "Forecast",      icon: TrendingUp },
  { to: "/admin/ai/revenue/pricing",      label: "Pricing",       icon: DollarSign },
  { to: "/admin/ai/revenue/opportunities",label: "Opportunities", icon: Sparkles },
  { to: "/admin/ai/revenue/alerts",       label: "Alerts",        icon: AlertTriangle },
  { to: "/admin/ai/revenue/patterns",     label: "Patterns",      icon: Activity },
] as const;

function RevenueAiLayout() {
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