import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { listRestaurantMenusFn, listRestaurantMenuItemsFn } from "@/modules/restaurant/menu/menu.functions";
import { useRestaurantWorkspace } from "@/modules/restaurant/ui/useRestaurantWorkspace";

export const Route = createFileRoute("/_authenticated/admin/restaurant/menu")({
  head: () => ({
    meta: [
      { title: "Menu Management — Restaurant & Bar OS" },
      { name: "description", content: "Menus, versions and items for every outlet in the restaurant tenant." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const ws = useRestaurantWorkspace();
  const tenantId = ws.data?.tenant?.id;
  const menusFn = useServerFn(listRestaurantMenusFn);
  const itemsFn = useServerFn(listRestaurantMenuItemsFn);

  const menus = useQuery({
    queryKey: ["restaurant.menus", tenantId],
    queryFn: () => menusFn({ data: { tenantId: tenantId!, limit: 100 } }),
    enabled: Boolean(tenantId),
  });
  const items = useQuery({
    queryKey: ["restaurant.menu-items", tenantId],
    queryFn: () => itemsFn({ data: { tenantId: tenantId!, limit: 200 } }),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Menu Management"
        description="Versioned menus per outlet. Items, pricing and availability are stored per tenant — nothing is hard-coded."
      />

      <SectionCard title="Menus">
        {(menus.data ?? []).length === 0 ? (
          <EmptyState title="No menus yet" description="Create a menu to start building your offer." />
        ) : (
          <ul className="divide-y text-sm">
            {(menus.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>
                  {m.name} <span className="text-muted-foreground">v{m.version}</span>
                </span>
                <span className="text-xs uppercase text-muted-foreground">
                  {m.status} · {m.currency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Items" description="Across all menus in this tenant.">
        {(items.data ?? []).length === 0 ? (
          <EmptyState title="No menu items" description="Items appear here once a menu has been populated." />
        ) : (
          <ul className="divide-y text-sm">
            {(items.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span>{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  {i.currency} {Number(i.price).toLocaleString()} · {i.available ? "available" : "off menu"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}