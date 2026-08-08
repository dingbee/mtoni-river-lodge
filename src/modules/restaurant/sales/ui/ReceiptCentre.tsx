/* eslint-disable @typescript-eslint/no-explicit-any -- server rows are untyped at this boundary. */
/**
 * Receipt Centre — every settled bill, findable after the guest has left.
 *
 * A receipt is evidence, so nothing here edits one: you can find it, read the
 * frozen snapshot, reprint it (which is counted), and record how a copy
 * reached the guest.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { LoadingState } from "@/components/os/LoadingState";
import { StatusChip } from "@/components/os/StatusChip";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { useRestaurantWorkspace } from "@/modules/restaurant/ui/useRestaurantWorkspace";
import { DocumentActions } from "@/modules/restaurant/documents/ui/DocumentActions";
import { listRestaurantReceiptsFn, deliverRestaurantReceiptFn } from "../bill.functions";
import { posReceiptFn } from "../pos.functions";
import { PosReceiptDialog } from "./PosReceiptDialog";
import { money } from "./pos-types";

const today = () => new Date().toISOString().slice(0, 10);
const weekAgo = () => new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);

export function ReceiptCentre() {
  const ws = useRestaurantWorkspace();
  const tenantId = ws.data?.tenant?.id ?? "";
  const currency = ws.data?.properties?.[0]?.currency ?? "TZS";

  const listFn = useServerFn(listRestaurantReceiptsFn);
  const receiptFn = useServerFn(posReceiptFn);
  const deliverFn = useServerFn(deliverRestaurantReceiptFn);

  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState<any | null>(null);

  const receipts = useQuery({
    queryKey: ["restaurant.receipts", tenantId, query, from, to],
    enabled: Boolean(tenantId),
    queryFn: () => listFn({ data: { tenantId, query, from, to, limit: 100 } }) as any,
  });

  const load = useAdminMutation({
    mutationFn: (vars: { orderId: string; reprint: boolean }) =>
      receiptFn({ data: { tenantId, orderId: vars.orderId, reprint: vars.reprint } }),
    silentSuccess: true,
    onSuccess: (data: any) => setOpen(data),
  });

  const deliver = useAdminMutation({
    mutationFn: (vars: { channel: any; to?: string }) =>
      deliverFn({ data: { tenantId, orderId: open?.order_id, ...vars } }),
    successMessage: "Receipt delivery recorded",
    onSuccess: (data: any) => {
      setOpen(data);
      void receipts.refetch();
    },
  });

  if (ws.isLoading) return <LoadingState />;
  if (!tenantId) {
    return <EmptyState title="No restaurant workspace" description="You are not a member of a restaurant tenant yet." />;
  }

  const rows = ((receipts.data as any[]) ?? []) as any[];
  const takings = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipt Centre"
        description="Every settled bill, searchable by receipt number, guest or period. Reprints are counted; delivery is recorded."
      />

      <SectionCard title="Find a receipt" description={`${rows.length} receipts · ${money(takings, currency)} settled`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="rcp-search">Receipt number</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="rcp-search"
                className="pl-8"
                placeholder="RCP-2026-000318"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="rcp-from">From</Label>
            <Input id="rcp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rcp-to">To</Label>
            <Input id="rcp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {receipts.isLoading && <LoadingState />}
          {!receipts.isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No receipts were issued in this period.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => load.mutate({ orderId: r.orderId, reprint: false })}
              >
                <div className="font-medium">{r.number}</div>
                <div className="text-xs text-muted-foreground">
                  Order {r.orderNumber ?? "—"} · {r.guestName ?? "Walk-in"} ·{" "}
                  {String(r.issuedAt ?? "").replace("T", " ").slice(0, 16)}
                </div>
              </button>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular-nums">{money(Number(r.total ?? 0), r.currency ?? currency)}</span>
                {r.reprints > 0 && <StatusChip tone="warning">{r.reprints} reprints</StatusChip>}
                <StatusChip tone={r.deliveredAt ? "success" : "neutral"}>
                  {r.deliveredAt ? `Delivered · ${r.deliveryChannel}` : "Not delivered"}
                </StatusChip>
                <DocumentActions tenantId={tenantId} type="customer_receipt" recordId={r.id} documentNumber={r.number} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <PosReceiptDialog
        receipt={open}
        onClose={() => setOpen(null)}
        onReprint={() => open && load.mutate({ orderId: open.order_id, reprint: true })}
        delivering={deliver.isPending}
        onDeliver={(input) => deliver.mutate(input)}
      />
    </div>
  );
}