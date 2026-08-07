import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Activity, History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/intelligence")({
  head: () => ({
    meta: [{ title: "Intelligence Core — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: IntelligenceLayout,
});

const TABS = [
  { to: "/admin/intelligence", label: "Timeline", icon: History, exact: true },
  { to: "/admin/intelligence/health", label: "Health Monitor", icon: Activity },
] as const;

function IntelligenceLayout() {
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to as string}
            activeOptions={{ exact: (t as { exact?: boolean }).exact ?? false }}
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