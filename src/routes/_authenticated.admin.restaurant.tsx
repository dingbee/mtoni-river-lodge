import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { BookOpen, Boxes, Calculator, LayoutDashboard, Settings2, ShoppingCart, Truck } from "lucide-react";
// Declares Restaurant & Bar OS to the Intelligence Core registry (inert registration).
import "@/modules/restaurant/intelligence/provider";

export const Route = createFileRoute("/_authenticated/admin/restaurant")({
  head: () => ({
    meta: [
      { title: "Restaurant & Bar OS — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RestaurantLayout,
});

const TABS = [
  { to: "/admin/restaurant", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/restaurant/menu", label: "Menu", icon: BookOpen },
  { to: "/admin/restaurant/inventory", label: "Inventory", icon: Boxes },
  { to: "/admin/restaurant/suppliers", label: "Suppliers", icon: Truck },
  { to: "/admin/restaurant/purchasing", label: "Purchasing", icon: ShoppingCart },
  { to: "/admin/restaurant/costing", label: "Costing", icon: Calculator },
  { to: "/admin/restaurant/settings", label: "Settings", icon: Settings2 },
] as const;

function RestaurantLayout() {
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