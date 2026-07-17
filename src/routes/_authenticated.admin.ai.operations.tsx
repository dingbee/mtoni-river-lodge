import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Users, ClipboardCheck, Wrench, ListChecks, BookOpen, Activity, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/operations")({
  head: () => ({
    meta: [{ title: "Operations AI — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: OperationsAiLayout,
});

const TABS = [
  { to: "/admin/ai/operations", label: "Command Centre", icon: LayoutDashboard, exact: true },
  { to: "/admin/ai/operations/frontdesk", label: "Front Desk", icon: Users },
  { to: "/admin/ai/operations/housekeeping", label: "Housekeeping", icon: ClipboardCheck },
  { to: "/admin/ai/operations/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/admin/ai/operations/tasks", label: "Task Intelligence", icon: ListChecks },
  { to: "/admin/ai/operations/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/admin/ai/operations/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/admin/ai/operations/timeline", label: "Timeline", icon: Activity },
] as const;

function OperationsAiLayout() {
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