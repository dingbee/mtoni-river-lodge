import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGuestPayments } from "@/lib/guest-intelligence.functions";

export function PaymentsPanel({ guestId }: { guestId: string }) {
  const fn = useServerFn(getGuestPayments);
  const q = useQuery({
    queryKey: ["guest-payments", guestId],
    queryFn: () => fn({ data: { id: guestId } }),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading payments…</p>;
  const data = (q.data as any) ?? { bookings: [], events: [] };
  const outstanding = (data.bookings ?? []).reduce(
    (sum: number, b: any) => sum + Number(b.balance_amount ?? 0),
    0,
  );
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding balance</div>
        <div className="mt-1 text-lg font-medium">${outstanding.toLocaleString()}</div>
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
                <span className="tabular-nums">{b.currency} {Number(b.total).toLocaleString()}</span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">
                  paid {Number(b.paid_amount ?? 0).toLocaleString()}
                </span>
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