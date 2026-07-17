import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listPayments,
  getPaymentTimeline,
  recordManualPayment,
} from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/payments")({
  head: () => ({
    meta: [
      { title: "Payment Centre — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Payments,
});

type BookingRow = Awaited<ReturnType<typeof listPayments>>[number];

function Payments() {
  const listFn = useServerFn(listPayments);
  const timelineFn = useServerFn(getPaymentTimeline);
  const recordFn = useServerFn(recordManualPayment);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [selected, setSelected] = useState<BookingRow | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance.payments", search, status],
    queryFn: () => listFn({ data: { search: search || undefined, status: status || undefined, limit: 100 } }),
  });
  const { data: timeline } = useQuery({
    queryKey: ["finance.timeline", selected?.id],
    queryFn: () => timelineFn({ data: { bookingId: selected!.id } }),
    enabled: !!selected,
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [eventType, setEventType] = useState<"manual_payment" | "refund" | "adjustment">("manual_payment");

  const record = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          bookingId: selected!.id,
          amount: Number(amount),
          method,
          note: note || undefined,
          eventType,
        },
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["finance.payments"] });
      qc.invalidateQueries({ queryKey: ["finance.timeline", selected?.id] });
      setAmount("");
      setNote("");
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Payment Centre" description="All payments across bookings, deposits and refunds." />

      <SectionCard>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search reference, guest, email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          <select
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="deposit_paid">Deposit paid</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
            <option value="payment_mismatch">Mismatch</option>
          </select>
        </div>
      </SectionCard>

      {isLoading ? (
        <LoadingState />
      ) : (
        <SectionCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Reference</th>
                  <th>Guest</th>
                  <th>Check-in</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{r.reference}</td>
                    <td>{r.guest_name}</td>
                    <td>{r.check_in}</td>
                    <td>{r.currency} {Number(r.total).toFixed(2)}</td>
                    <td>{r.currency} {Number(r.paid_amount ?? 0).toFixed(2)}</td>
                    <td>{r.currency} {Number(r.balance_amount ?? 0).toFixed(2)}</td>
                    <td><Badge variant="secondary">{r.payment_status}</Badge></td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                        <CreditCard className="mr-1 h-3 w-3" /> Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment · {selected?.reference}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>Total: <strong>{selected.currency} {Number(selected.total).toFixed(2)}</strong></div>
                <div>Paid: <strong>{selected.currency} {Number(selected.paid_amount ?? 0).toFixed(2)}</strong></div>
                <div>Balance: <strong>{selected.currency} {Number(selected.balance_amount ?? 0).toFixed(2)}</strong></div>
              </div>
              <div className="rounded border border-border p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Record payment / refund</p>
                <div className="grid grid-cols-2 gap-2">
                  <select className="rounded border border-border bg-background px-2 py-1 text-sm" value={eventType} onChange={(e) => setEventType(e.target.value as never)}>
                    <option value="manual_payment">Manual payment</option>
                    <option value="refund">Refund</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                  <Input placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Input placeholder="Method (cash, transfer…)" value={method} onChange={(e) => setMethod(e.target.value)} />
                  <Input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <Button size="sm" className="mt-2" onClick={() => record.mutate()} disabled={record.isPending || !amount}>
                  Record
                </Button>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Timeline</p>
                <div className="space-y-1 text-xs">
                  {(timeline?.events ?? []).map((e) => (
                    <div key={e.id} className="flex justify-between border-b border-border/50 py-1">
                      <span>{e.event_type} · {e.payment_method ?? e.provider}</span>
                      <span>{e.amount != null ? `${e.currency ?? ""} ${Number(e.amount).toFixed(2)}` : ""} · {new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                  {!(timeline?.events ?? []).length && <p className="text-muted-foreground">No events yet.</p>}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
