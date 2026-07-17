import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Sunrise, ListChecks, BarChart3, History, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/executive")({
  head: () => ({ meta: [{ title: "Executive Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ExecutiveAiLayout,
});

const TABS = [
  { to: "/admin/ai/executive",            label: "Dashboard",       icon: LayoutDashboard, exact: true },
  { to: "/admin/ai/executive/briefing",   label: "Morning Briefing", icon: Sunrise },
  { to: "/admin/ai/executive/decisions",  label: "Decision Queue",  icon: ListChecks },
  { to: "/admin/ai/executive/kpis",       label: "Executive KPIs",  icon: BarChart3 },
  { to: "/admin/ai/executive/timeline",   label: "Timeline",        icon: History },
  { to: "/admin/ai/executive/risks",      label: "Strategic Risks", icon: AlertTriangle },
] as const;

function ExecutiveAiLayout() {
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