/* eslint-disable @typescript-eslint/no-explicit-any -- server function rows are untyped at this boundary. */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { listRestaurantPurchaseOrdersFn } from "@/modules/restaurant/purchasing/purchasing.functions";
import { useRestaurantWorkspace } from "@/modules/restaurant/ui/useRestaurantWorkspace";

export const Route = createFileRoute("/_authenticated/admin/restaurant/purchasing")({
  head: () => ({
    meta: [
      { title: "Purchasing — Restaurant & Bar OS" },
      { name: "description", content: "Purchase orders, approvals and receiving for restaurant supply." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PurchasingPage,
});

function PurchasingPage() {
  const ws = useRestaurantWorkspace();
  const tenantId = ws.data?.tenant?.id;
  const fn = useServerFn(listRestaurantPurchaseOrdersFn);
  const q = useQuery({
    queryKey: ["restaurant.purchase-orders", tenantId],
    queryFn: () => fn({ data: { tenantId: tenantId!, limit: 50 } }),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchasing"
        description="Draft → submitted → approved → received. Every transition is an event the Intelligence Core can observe."
      />
      <SectionCard title="Purchase orders">
        {(q.data ?? []).length === 0 ? (
          <EmptyState title="No purchase orders" description="Create a purchase order from a supplier catalogue." />
        ) : (
          <ul className="divide-y text-sm">
            {(q.data ?? []).map((o: any) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <span>{o.reference}</span>
                <span className="text-xs text-muted-foreground">
                  {o.status} · {o.currency} {Number(o.total ?? 0).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}