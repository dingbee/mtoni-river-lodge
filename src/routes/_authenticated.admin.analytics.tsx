import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isFounderAiAdmin } from "@/domains/ai/governance.functions";
import { LayoutDashboard, Calendar, Globe, TrendingUp, Megaphone, ClipboardCheck, Bot, Crown, FileText, LineChart, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics & Intelligence Hub — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
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
  const accessFn = useServerFn(isFounderAiAdmin);
  const access = useQuery({ queryKey: ["staynas-founder-admin"], queryFn: () => accessFn() });
  if (access.isLoading) return <div className="p-6 text-sm text-muted-foreground">Verifying founder access…</div>;
  if (access.isError || access.data !== true) return <div className="rounded-xl border p-6"><h1 className="text-lg font-semibold">Founder administration only</h1><p className="mt-2 text-sm text-muted-foreground">Platform analytics currently use global datasets and remain restricted until tenant-scoped reporting is implemented.</p></div>;
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
