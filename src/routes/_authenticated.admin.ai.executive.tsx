import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Sunrise, ListChecks, BarChart3, History, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/executive")({
  head: () => ({ meta: [{ title: "Executive Intelligence — StayNas AI" }, { name: "robots", content: "noindex,nofollow" }] }),
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
      <nav aria-label="Executive Intelligence navigation" className="os-context-nav">
        <div className="os-context-nav__items">
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
        </div>
      </nav>
      <Outlet />
    </div>
  );
}