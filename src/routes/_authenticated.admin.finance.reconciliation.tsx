import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getReconciliation } from "@/domains/finance/finance.functions";
import { listDistributionFinancialEvidence } from "@/domains/finance/distribution-financial-evidence.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Reconciliation,
});

function providerEvidenceAmount(evidence: Record<string, unknown>) {
  const amount = evidence.settlementAmount ?? evidence.paymentAmount ?? evidence.refundAmount
    ?? evidence.refundReversalAmount ?? evidence.grossAmount ?? evidence.expectedSettlement;
  const currency = evidence.settlementCurrency ?? evidence.paymentCurrency ?? evidence.refundCurrency
    ?? evidence.originalCurrency;
  return amount == null ? "Amount not supplied" : `${String(currency ?? "Currency unspecified")} ${String(amount)}`;
}

function Reconciliation() {
  const fn = useServerFn(getReconciliation);
  const evidenceFn = useServerFn(listDistributionFinancialEvidence);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [evidenceStatus, setEvidenceStatus] = useState("all");
  const { data, isLoading } = useQuery({
    queryKey: ["finance.recon", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });
  const { data: providerEvidence, isLoading: evidenceLoading, error: evidenceError } = useQuery({
    queryKey: ["finance.distribution-evidence", evidenceStatus],
    queryFn: () => evidenceFn({ data: { status: evidenceStatus as "all" | "unmatched" | "review_required" | "duplicate_reference" | "evidence_received", limit: 100 } }),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reconciliation"
        description="Canonical payment-ledger reconciliation and separate provider financial evidence."
        actions={<Link to="/admin/finance/payments" className="text-sm text-primary hover:underline">Payment centre</Link>}
      />
      <SectionCard>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm"><span className="mb-1 block text-xs uppercase text-muted-foreground">From</span><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs uppercase text-muted-foreground">To</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </SectionCard>
      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <SectionCard title={`Unmatched canonical bookings (${data.unmatched.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Reference</th><th>Booking paid</th><th>Events total</th><th>Paid variance</th><th>Balance variance</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.unmatched.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{r.reference}</td>
                    <td>{r.currency} {Number(r.paid_amount ?? 0).toFixed(2)}</td>
                    <td>{r.currency} {Number(r.events_total).toFixed(2)}</td>
                    <td className={r.variance !== 0 ? "text-[color:var(--os-warn)]" : ""}>{r.variance.toFixed(2)}</td>
                    <td className={r.balance_variance !== 0 ? "text-[color:var(--os-warn)]" : ""}>{r.currency} {r.balance_variance.toFixed(2)}</td>
                    <td><Badge variant="secondary">{r.payment_status}</Badge>{r.currency_mismatch && <Badge variant="destructive" className="ml-1">Currency</Badge>}</td>
                  </tr>
                ))}
                {!data.unmatched.length && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">All canonical payment ledgers reconcile.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Matched: {data.matched} · Unlinked payment events remain founder-audit-only and are excluded from tenant scope.</p>
        </SectionCard>
      )}

      <SectionCard title="Distribution provider financial evidence">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-xs text-muted-foreground">Provider payment, refund and settlement notifications are evidence only. They do not post to the payment ledger or change booking payment status.</p>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={evidenceStatus} onChange={(e) => setEvidenceStatus(e.target.value)}>
            <option value="all">All evidence</option>
            <option value="unmatched">Unmatched</option>
            <option value="review_required">Review required</option>
            <option value="duplicate_reference">Duplicate reference</option>
            <option value="evidence_received">Evidence received</option>
          </select>
        </div>
        {evidenceError && <p className="mb-3 text-sm text-destructive">Provider evidence unavailable: {(evidenceError as Error).message}</p>}
        {evidenceLoading ? <LoadingState /> : !providerEvidence?.length ? (
          <p className="text-sm text-muted-foreground">No provider financial evidence for the active property and selected status.</p>
        ) : (
          <div className="space-y-3">
            {providerEvidence.map((item) => {
              const evidence = (item.evidence ?? {}) as Record<string, unknown>;
              return (
                <article key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.provider_key} · {item.event_type.replace("reservation.", "")}</p>
                      <p className="text-xs text-muted-foreground">{item.environment} · External reservation {item.external_reservation_id}</p>
                    </div>
                    <Badge variant={item.reconciliation_status === "unmatched" ? "destructive" : "secondary"}>{item.reconciliation_status.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><span className="text-muted-foreground">Evidence amount: </span>{providerEvidenceAmount(evidence)}</div>
                    <div><span className="text-muted-foreground">Provider reference: </span>{item.provider_reference ?? "Not supplied"}</div>
                    <div><span className="text-muted-foreground">Canonical booking: </span>{item.booking?.reference ?? (item.booking_id ? "Linked booking not visible" : "No canonical booking match")}</div>
                    <div><span className="text-muted-foreground">StayNas payment state: </span>{item.booking?.payment_status ?? "Not applicable"}</div>
                    {item.booking && <div><span className="text-muted-foreground">Posted paid amount: </span>{item.booking.currency ?? ""} {Number(item.booking.paid_amount ?? 0).toFixed(2)}</div>}
                    {item.booking && <div><span className="text-muted-foreground">Outstanding balance: </span>{item.booking.currency ?? ""} {Number(item.booking.balance_amount ?? 0).toFixed(2)}</div>}
                  </div>
                  {item.reconciliation_code && <p className="mt-2 text-xs text-muted-foreground">Review code: {item.reconciliation_code}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">Received {new Date(item.received_at).toLocaleString()}</p>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
