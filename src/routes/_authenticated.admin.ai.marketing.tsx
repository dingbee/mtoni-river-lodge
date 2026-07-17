import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Search, FileText, Megaphone, Star, Sparkles, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing")({
  head: () => ({ meta: [{ title: "Marketing Intelligence AI — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MarketingAiLayout,
});

const TABS = [
  { to: "/admin/ai/marketing",            label: "Dashboard",  icon: LayoutDashboard, exact: true },
  { to: "/admin/ai/marketing/seo",        label: "SEO",        icon: Search },
  { to: "/admin/ai/marketing/content",    label: "Content",    icon: FileText },
  { to: "/admin/ai/marketing/campaigns",  label: "Campaigns",  icon: Megaphone },
  { to: "/admin/ai/marketing/reputation", label: "Reputation", icon: Star },
  { to: "/admin/ai/marketing/brand",      label: "Brand",      icon: Sparkles },
  { to: "/admin/ai/marketing/priorities", label: "Priorities", icon: ListChecks },
] as const;

function MarketingAiLayout() {
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