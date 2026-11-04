import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGuestPayments } from "@/lib/guest-intelligence.functions";
import { calculateReservationFinancials } from "@/domains/finance/reservation-financials";

export function PaymentsPanel({ guestId }: { guestId: string }) {
  const fn = useServerFn(getGuestPayments);
  const q = useQuery({
    queryKey: ["guest-payments", guestId],
    queryFn: () => fn({ data: { id: guestId } }),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading payments…</p>;
  const data = (q.data as any) ?? { bookings: [], events: [] };
  const outstandingByCurrency = new Map<string, number>();
  for (const booking of data.bookings ?? []) {
    const currency = booking.currency || "UNKNOWN";
    const current = outstandingByCurrency.get(currency) ?? 0;
    outstandingByCurrency.set(currency, current + calculateReservationFinancials({
      total: booking.total,
      depositRequired: booking.deposit_amount,
      paidToDate: booking.paid_amount,
    }).outstanding);
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding by currency</div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {Array.from(outstandingByCurrency, ([currency, amount]) => (
            <div key={currency} className="font-medium tabular-nums">{currency} {amount.toLocaleString()}</div>
          ))}
          {outstandingByCurrency.size === 0 && <span className="text-muted-foreground">No outstanding balance</span>}
        </div>
      </div>
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoices</div>
        {(data.bookings ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <ul className="divide-y">
            {data.bookings.map((b: any) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-32 font-medium">{b.invoice_number ?? b.reference}</span>
                <span className="flex-1 text-muted-foreground">{b.payment_status}</span>
                <span className="text-right tabular-nums">{b.currency} {Number(b.total).toLocaleString()}</span>
                <span className="text-right tabular-nums text-muted-foreground">Deposit {Number(b.deposit_amount ?? 0).toLocaleString()}</span>
                <span className="text-right tabular-nums text-muted-foreground">Paid {Number(b.paid_amount ?? 0).toLocaleString()}</span>
                <span className="text-right tabular-nums text-muted-foreground">Outstanding {calculateReservationFinancials({ total: b.total, depositRequired: b.deposit_amount, paidToDate: b.paid_amount }).outstanding.toLocaleString()}</span>
                <span className="text-right tabular-nums text-muted-foreground">Check-in {calculateReservationFinancials({ total: b.total, depositRequired: b.deposit_amount, paidToDate: b.paid_amount }).balanceDueAtCheckIn.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment events</div>
        {(data.events ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No payment events recorded.</p>
        ) : (
          <ul className="divide-y">
            {data.events.map((e: any) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-40 text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                <span className="flex-1">{e.event_type ?? e.provider}</span>
                <span className="tabular-nums">{e.currency ?? ""} {Number(e.amount ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}