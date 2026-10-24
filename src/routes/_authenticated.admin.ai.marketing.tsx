import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, Search, FileText, Megaphone, Star, Sparkles, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/marketing")({
  head: () => ({ meta: [{ title: "Marketing Intelligence AI — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MarketingAiLayout,
});

const TABS = [
  { to: "/admin/ai/marketing", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/ai/marketing/seo", label: "SEO", icon: Search },
  { to: "/admin/ai/marketing/content", label: "Content", icon: FileText },
  { to: "/admin/ai/marketing/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/admin/ai/marketing/reputation", label: "Reputation", icon: Star },
  { to: "/admin/ai/marketing/brand", label: "Brand", icon: Sparkles },
  { to: "/admin/ai/marketing/priorities", label: "Priorities", icon: ListChecks },
] as const;

function MarketingAiLayout() {
  return (
    <div className="space-y-4">
      <nav aria-label="Marketing Intelligence navigation" className="os-context-nav rounded-xl border border-[color:var(--os-hairline)] bg-[color:var(--os-surface)] p-2 sm:p-3">
        <div className="os-context-nav__items os-context-nav__items--compact">
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