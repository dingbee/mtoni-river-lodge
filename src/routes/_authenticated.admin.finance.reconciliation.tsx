import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getReconciliation } from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Reconciliation,
});

function Reconciliation() {
  const fn = useServerFn(getReconciliation);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useQuery({
    queryKey: ["finance.recon", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Financial Reconciliation" description="Match reservations, payments and Pesapal events." />
      <SectionCard>
        <div className="flex gap-3">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </SectionCard>
      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <SectionCard title={`Unmatched Bookings (${data.unmatched.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Reference</th>
                    <th>Booking paid</th>
                    <th>Events total</th>
                    <th>Variance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unmatched.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 font-mono text-xs">{r.reference}</td>
                      <td>{r.currency} {Number(r.paid_amount ?? 0).toFixed(2)}</td>
                      <td>{r.currency} {Number(r.events_total).toFixed(2)}</td>
                      <td className={r.variance !== 0 ? "text-amber-600" : ""}>{r.variance.toFixed(2)}</td>
                      <td><Badge variant="secondary">{r.payment_status}</Badge></td>
                    </tr>
                  ))}
                  {!data.unmatched.length && (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">All bookings reconciled ✓</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Matched: {data.matched} · Unmatched Pesapal events: {data.unmatchedEvents.length}</p>
          </SectionCard>
          {data.unmatchedEvents.length > 0 && (
            <SectionCard title="Orphan Payment Events">
              <div className="space-y-1 text-xs">
                {data.unmatchedEvents.slice(0, 30).map((e) => (
                  <div key={e.id} className="flex justify-between border-b border-border/40 py-1">
                    <span>{e.event_type} · {e.merchant_reference}</span>
                    <span>{e.currency ?? ""} {e.amount ?? ""} · {new Date(e.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}