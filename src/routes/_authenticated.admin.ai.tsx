import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Sparkles, BarChart3, FileText, History, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  head: () => ({ meta: [{ title: "Mtoni AI — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiLayout,
});

const TABS = [
  { to: "/admin/ai",           label: "Command Centre", icon: Sparkles, exact: true },
  { to: "/admin/ai/insights",  label: "Insights",       icon: BarChart3 },
  { to: "/admin/ai/knowledge", label: "Knowledge Base", icon: FileText },
  { to: "/admin/ai/activity",  label: "AI Activity",    icon: History },
  { to: "/admin/ai/settings",  label: "Settings",       icon: Settings },
] as const;

function AiLayout() {
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