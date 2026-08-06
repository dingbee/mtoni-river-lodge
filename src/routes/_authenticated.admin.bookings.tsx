import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listBookings, getBookingDetail, updateBookingStatus } from "@/lib/admin.functions";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  head: () => ({ meta: [{ title: "Bookings — Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminBookings,
});

type StatusFilter = "all" | "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
type PaymentFilter = "all" | "unpaid" | "deposit_paid" | "paid" | "refunded";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
  completed: "bg-muted text-foreground",
  no_show: "bg-zinc-200 text-zinc-700",
};

const paymentColors: Record<string, string> = {
  unpaid: "bg-zinc-100 text-zinc-700",
  deposit_paid: "bg-emerald-100 text-emerald-900",
  paid: "bg-emerald-200 text-emerald-900",
  refunded: "bg-rose-100 text-rose-900",
};

function AdminBookings() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const listFn = useServerFn(listBookings);
  const detailFn = useServerFn(getBookingDetail);
  const updateFn = useServerFn(updateBookingStatus);
  const qc = useQueryClient();

  const bookings = useQuery({
    queryKey: ["admin-bookings", status, paymentStatus, from, to],
    queryFn: () => listFn({ data: { status, paymentStatus, from: from || undefined, to: to || undefined } }),
  });

  const detail = useQuery({
    queryKey: ["admin-booking", selected],
    queryFn: () => detailFn({ data: { id: selected! } }),
    enabled: !!selected,
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; status: Exclude<StatusFilter, "all"> }) =>
      updateFn({ data: vars }),
    onSuccess: () => {
      toast.success("Booking updated");
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["admin-booking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fmt = (n: number, c: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Every direct reservation, its payment state and status history."
      />

      <SectionCard title="Filters" description="Narrow the reservation book by status, payment and arrival window.">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
              <option value="no_show">No-show</option>
            </select>
          </div>
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">Payment</label>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentFilter)} className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <option value="all">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="deposit_paid">Deposit paid</option>
              <option value="paid">Paid in full</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">Check-in from</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">Check-in to</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm" />
          </div>
          {(from || to || status !== "all" || paymentStatus !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => { setStatus("all"); setPaymentStatus("all"); setFrom(""); setTo(""); }}>Clear</Button>
          )}
        </div>
      </SectionCard>

      <SectionCard className="p-0">
        <div className="overflow-x-auto">
          {bookings.isLoading && (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          )}
          {bookings.error && <div className="p-6 text-sm text-destructive">{(bookings.error as Error).message}</div>}
          {bookings.data && bookings.data.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No bookings found.</div>}
          {bookings.data && bookings.data.length > 0 && (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/30 text-left text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Dates</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {bookings.data.map((b: any) => (
                  <tr key={b.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.guest_name}</div>
                      <div className="text-xs text-muted-foreground">{b.guest_email}</div>
                    </td>
                    <td className="px-4 py-3">{b.room?.name ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{b.check_in} → {b.check_out}<div className="text-xs text-muted-foreground">{b.nights} night{b.nights === 1 ? "" : "s"}</div></td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(Number(b.total), b.currency)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.15em] ${statusColors[b.status] ?? ""}`}>{b.status}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.15em] ${paymentColors[b.payment_status] ?? ""}`}>{(b.payment_status ?? "unpaid").replace("_", " ")}</span></td>
                    <td className="px-4 py-3"><button onClick={() => setSelected(b.id)} className="text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:underline">View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 sm:items-center sm:p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-6 sm:rounded-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
            {detail.isLoading && <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {detail.error && <p className="text-sm text-destructive">{(detail.error as Error).message}</p>}
            {detail.data && (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{detail.data.booking.reference}</p>
                    <h2 className="font-display text-2xl">{detail.data.booking.guest_name}</h2>
                    <p className="text-sm text-muted-foreground">{detail.data.booking.guest_email} · {detail.data.booking.guest_phone ?? "—"}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-xs uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground">Close</button>
                </div>

                <div className="mt-5 grid gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Room: </span>{detail.data.room?.name}</div>
                  <div><span className="text-muted-foreground">Status: </span><span className={`rounded-full px-2 py-0.5 text-[0.65rem] uppercase ${statusColors[detail.data.booking.status]}`}>{detail.data.booking.status}</span></div>
                  <div><span className="text-muted-foreground">Check-in: </span>{detail.data.booking.check_in}</div>
                  <div><span className="text-muted-foreground">Check-out: </span>{detail.data.booking.check_out}</div>
                  <div><span className="text-muted-foreground">Adults: </span>{detail.data.booking.adults}</div>
                  <div><span className="text-muted-foreground">Children: </span>{detail.data.booking.children}</div>
                  <div><span className="text-muted-foreground">Country: </span>{detail.data.booking.country ?? "—"}</div>
                  <div><span className="text-muted-foreground">Payment: </span>{detail.data.booking.payment_status}</div>
                  {detail.data.booking.payment_method && (
                    <div><span className="text-muted-foreground">Method: </span>{detail.data.booking.payment_method}</div>
                  )}
                  {detail.data.booking.pesapal_order_tracking_id && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Pesapal ref: </span><span className="font-mono text-xs">{detail.data.booking.pesapal_order_tracking_id}</span></div>
                  )}
                  {detail.data.booking.payment_completed_at && (
                    <div><span className="text-muted-foreground">Paid at: </span>{new Date(detail.data.booking.payment_completed_at).toLocaleString()}</div>
                  )}
                </div>

                {detail.data.booking.special_requests && (
                  <div className="mt-4 rounded-lg border border-border p-3 text-sm">
                    <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">Special requests</p>
                    <p className="mt-1">{detail.data.booking.special_requests}</p>
                  </div>
                )}

                <div className="mt-5">
                  <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">Nightly breakdown</p>
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
                    {detail.data.nights.map((n: any) => (
                      <li key={n.date} className="flex justify-between px-3 py-2"><span>{n.date}</span><span>{fmt(n.nightly_rate, detail.data.booking.currency)}</span></li>
                    ))}
                  </ul>
                </div>

                {detail.data.extras.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">Extras</p>
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border text-sm">
                      {detail.data.extras.map((e: any, i: number) => (
                        <li key={i} className="flex justify-between px-3 py-2"><span>{e.name} × {e.quantity}</span><span>{fmt(e.line_total, detail.data.booking.currency)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-4 text-sm">
                  <span className="text-muted-foreground">Subtotal</span><span className="text-right">{fmt(Number(detail.data.booking.subtotal), detail.data.booking.currency)}</span>
                  <span className="text-muted-foreground">Extras</span><span className="text-right">{fmt(Number(detail.data.booking.extras_total), detail.data.booking.currency)}</span>
                  <span className="font-display text-base">Total</span><span className="text-right font-display text-base">{fmt(Number(detail.data.booking.total), detail.data.booking.currency)}</span>
                  <span className="text-muted-foreground">Deposit (50%)</span><span className="text-right">{fmt(Number(detail.data.booking.deposit_amount ?? Number(detail.data.booking.total) * 0.5), detail.data.booking.currency)}</span>
                  <span className="text-muted-foreground">Balance (at check-in)</span><span className="text-right">{fmt(Number(detail.data.booking.balance_amount ?? Number(detail.data.booking.total) * 0.5), detail.data.booking.currency)}</span>
                </div>

                <div className="mt-6">
                  <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">Update status</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["pending", "confirmed", "cancelled", "completed", "no_show"] as const).map((s) => (
                      <button
                        key={s}
                        disabled={update.isPending || detail.data.booking.status === s}
                        onClick={() => update.mutate({ id: detail.data.booking.id, status: s })}
                        className="rounded-full border border-border px-4 py-2 text-[0.65rem] uppercase tracking-[0.18em] hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
                      >
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}