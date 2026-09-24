import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Bed, ClipboardCheck, ListChecks, AlertTriangle, Activity, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/operations")({
  head: () => ({ meta: [{ title: "Operations Centre — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OperationsLayout,
});

const TABS = [
  { to: "/admin/operations", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/operations/rooms", label: "Room Board", icon: Bed },
  { to: "/admin/operations/arrivals", label: "Arrivals", icon: UserCheck, exact: true },
  { to: "/admin/operations/housekeeping", label: "Housekeeping", icon: ClipboardCheck },
  { to: "/admin/operations/tasks", label: "Tasks", icon: ListChecks },
  { to: "/admin/operations/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/admin/operations/timeline", label: "Activity", icon: Activity },
] as const;

function OperationsLayout() {
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