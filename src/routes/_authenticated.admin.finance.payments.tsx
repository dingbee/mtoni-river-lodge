import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { calculateReservationFinancials } from "@/domains/finance/reservation-financials";
import { ReservationFinancialSummary } from "@/components/os/finance/ReservationFinancialSummary";
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
  const { data: timeline, error: timelineError } = useQuery({
    queryKey: ["finance.timeline", selected?.id],
    queryFn: () => timelineFn({ data: { bookingId: selected!.id } }),
    enabled: !!selected,
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [eventType, setEventType] = useState<"manual_payment" | "refund">("manual_payment");
  const [originalPaymentEventId, setOriginalPaymentEventId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const providerReversedEventIds = new Set(
    (timeline?.events ?? [])
      .filter((e) => e.event_type === "provider_reversal")
      .map((e) => (e as typeof e & { provider_reverses_event_id?: string | null }).provider_reverses_event_id)
      .filter((id): id is string => Boolean(id)),
  );
  const refundableEvents = (timeline?.events ?? []).filter(
    (e) => ["manual_payment", "payment_completed"].includes(e.event_type)
      && Number(e.amount ?? 0) > 0
      && !providerReversedEventIds.has(e.id),
  );

  const record = useMutation({
    mutationFn: () =>
      recordFn({
        data: {
          bookingId: selected!.id,
          amount: Number(amount),
          method,
          note: note || undefined,
          eventType,
          originalPaymentEventId: eventType === "refund" ? originalPaymentEventId : undefined,
          idempotencyKey,
        },
      }),
    onSuccess: (result) => {
      toast.success(result.duplicate ? "Payment already recorded — duplicate safely ignored" : "Payment recorded");
      qc.invalidateQueries({ queryKey: ["finance.payments"] });
      qc.invalidateQueries({ queryKey: ["finance.timeline", selected?.id] });
      setAmount("");
      setNote("");
      setIdempotencyKey(crypto.randomUUID());
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
                  <th>Deposit required</th>
                  <th>Paid to date</th>
                  <th>Outstanding</th>
                  <th>Due at check-in</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((r) => {
                  const financials = calculateReservationFinancials({
                    total: r.total,
                    depositRequired: r.deposit_amount,
                    paidToDate: r.paid_amount,
                  });
                  const money = (value: number) => `${r.currency} ${value.toFixed(2)}`;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 font-mono text-xs">{r.reference}</td>
                      <td>{r.guest_name}</td>
                      <td>{r.check_in}</td>
                      <td>{money(financials.reservationTotal)}</td>
                      <td>{money(financials.depositRequired)}</td>
                      <td>{money(financials.paidToDate)}</td>
                      <td>{money(financials.outstanding)}</td>
                      <td>{money(financials.balanceDueAtCheckIn)}</td>
                      <td><Badge variant="secondary">{r.payment_status}</Badge></td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                          <CreditCard className="mr-1 h-3 w-3" /> Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
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
              <ReservationFinancialSummary
                total={selected.total}
                depositRequired={selected.deposit_amount}
                paidToDate={selected.paid_amount}
                currency={selected.currency}
              />
              <div className="rounded border border-border p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Record payment / refund</p>
                <div className="grid grid-cols-2 gap-2">
                  <select className="rounded border border-border bg-background px-2 py-1 text-sm" value={eventType} onChange={(e) => { setEventType(e.target.value as "manual_payment" | "refund"); setOriginalPaymentEventId(""); }}>
                    <option value="manual_payment">Manual payment</option>
                    <option value="refund">Refund</option>
                  </select>
                  <Input placeholder="Amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  {eventType === "refund" && (
                    <select
                      className="col-span-2 rounded border border-border bg-background px-2 py-2 text-sm"
                      value={originalPaymentEventId}
                      onChange={(e) => setOriginalPaymentEventId(e.target.value)}
                    >
                      <option value="">Select original payment to refund</option>
                      {refundableEvents.map((event) => {
                        const refunded = (timeline?.events ?? [])
                          .filter((candidate) => candidate.event_type === "refund" && (candidate as typeof candidate & { reverses_event_id?: string | null }).reverses_event_id === event.id)
                          .reduce((sum, candidate) => sum + Math.abs(Number(candidate.amount ?? 0)), 0);
                        const remaining = Math.max(0, Number(event.amount) - refunded);
                        return remaining > 0 ? (
                          <option key={event.id} value={event.id}>
                            {event.event_type} · {event.currency ?? selected.currency} {remaining.toFixed(2)} remaining · {new Date(event.created_at).toLocaleDateString()}
                          </option>
                        ) : null;
                      })}
                    </select>
                  )}
                  <Input placeholder="Method (cash, transfer…)" value={method} onChange={(e) => setMethod(e.target.value)} />
                  <Input placeholder={eventType === "refund" ? "Refund reason (required)" : "Note"} required={eventType === "refund"} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <Button size="sm" className="mt-2" onClick={() => record.mutate()} disabled={record.isPending || !amount || (eventType === "refund" && (!originalPaymentEventId || !note.trim()))}>
                  Record
                </Button>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Timeline</p>
                <div className="space-y-1 text-xs">
                  {timelineError && <p className="text-destructive">Payment timeline unavailable: {(timelineError as Error).message}</p>}
                  {!timelineError && (timeline?.events ?? []).map((e) => (
                    <div key={e.id} className="flex justify-between border-b border-border/50 py-1">
                      <span>{e.event_type} · {e.payment_method ?? e.provider}</span>
                      <span>{e.amount != null ? `${e.currency ?? ""} ${Number(e.amount).toFixed(2)}` : ""} · {new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                  {!timelineError && !(timeline?.events ?? []).length && <p className="text-muted-foreground">No events yet.</p>}
                </div>
              </div>
              {!timelineError && (timeline?.providerEvidence ?? []).length > 0 && (
                <div className="rounded border border-border p-3">
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Channel financial evidence · Not posted to payment ledger
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Provider notifications are reconciliation evidence only. They do not record a payment, refund or settlement in StayNas.
                  </p>
                  <div className="space-y-2">
                    {timeline!.providerEvidence.map((item: any) => {
                      const evidence = (item.evidence ?? {}) as Record<string, unknown>;
                      const amount = evidence.settlementAmount ?? evidence.paymentAmount
                        ?? evidence.refundAmount ?? evidence.grossAmount;
                      const currency = evidence.settlementCurrency ?? evidence.paymentCurrency
                        ?? evidence.refundCurrency;
                      return (
                        <div key={item.id} className="rounded bg-muted/40 px-2 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{item.provider_key} · {item.event_type}</span>
                            <Badge variant="outline">{item.reconciliation_status}</Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                            {item.provider_reference && <span>Reference: {item.provider_reference}</span>}
                            {amount != null && <span>Evidence amount: {currency ?? ""} {String(amount)}</span>}
                            <span>{new Date(item.received_at).toLocaleString()}</span>
                          </div>
                          {item.reconciliation_code && (
                            <p className="mt-1 text-muted-foreground">Review: {item.reconciliation_code}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
