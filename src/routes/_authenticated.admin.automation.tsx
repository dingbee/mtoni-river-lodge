import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isFounderAiAdmin } from "@/domains/ai/governance.functions";
import { Workflow, ListChecks, Bell, Clock, ShieldCheck, LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/automation")({
  head: () => ({ meta: [{ title: "Automation — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AutomationLayout,
});

const TABS = [
  { to: "/admin/automation", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/automation/workflows", label: "Workflows", icon: Workflow },
  { to: "/admin/automation/monitor", label: "Monitor", icon: ListChecks },
  { to: "/admin/automation/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/automation/scheduled", label: "Scheduled Jobs", icon: Clock },
  { to: "/admin/automation/approvals", label: "Approvals", icon: ShieldCheck },
] as const;

function AutomationLayout() {
  const accessFn = useServerFn(isFounderAiAdmin);
  const access = useQuery({ queryKey: ["staynas-founder-admin"], queryFn: () => accessFn() });
  if (access.isLoading) return <div className="p-6 text-sm text-muted-foreground">Verifying founder access…</div>;
  if (access.isError || access.data !== true) return <div className="rounded-xl border p-6"><h1 className="text-lg font-semibold">Founder administration only</h1><p className="mt-2 text-sm text-muted-foreground">Workflow and approval records are not yet property-scoped, so this workspace is restricted to the StayNas founder administrator.</p></div>;
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