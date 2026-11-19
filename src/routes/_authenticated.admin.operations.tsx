import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Bed, ClipboardCheck, ListChecks, AlertTriangle, Activity, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({ meta: [{ title: "Operations Centre — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OperationsLayout,
});

const TABS = [
  { to: "/admin/operations", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/operations/rooms", label: "Room board", icon: Bed },
  { to: "/admin/operations/arrivals", label: "Arrivals", icon: UserCheck, exact: true },
  { to: "/admin/operations/housekeeping", label: "Housekeeping", icon: ClipboardCheck },
  { to: "/admin/operations/tasks", label: "Tasks", icon: ListChecks },
  { to: "/admin/operations/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/admin/operations/timeline", label: "Activity", icon: Activity },
] as const;

function OperationsLayout() {
  return (
    <div className="space-y-5">
      <nav aria-label="Operations navigation" className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:flex-wrap lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to as any}
            activeOptions={{ exact: (t as any).exact ?? false }}
            activeProps={{ className: "border-[#C5A875] bg-[#172B43] text-white" }}
            inactiveProps={{ className: "border-transparent bg-card text-muted-foreground hover:bg-muted hover:text-foreground" }}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-normal transition-colors"
          >
            <t.icon className="size-4" />
            {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
