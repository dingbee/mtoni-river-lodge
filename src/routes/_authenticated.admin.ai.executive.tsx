import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isFounderAiAdmin } from "@/domains/ai/governance.functions";
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
  const accessFn = useServerFn(isFounderAiAdmin);
  const access = useQuery({ queryKey: ["staynas-founder-admin"], queryFn: () => accessFn() });
  if (access.isLoading) return <div className="p-6 text-sm text-muted-foreground">Verifying founder access…</div>;
  if (access.isError || access.data !== true) return <div className="rounded-xl border p-6"><h1 className="text-lg font-semibold">Founder administration only</h1><p className="mt-2 text-sm text-muted-foreground">Executive intelligence currently uses global AI and review datasets that are not yet tenant-scoped.</p></div>;
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