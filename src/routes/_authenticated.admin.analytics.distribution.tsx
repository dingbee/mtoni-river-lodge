import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Network } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { getDistributionAnalytics } from "@/domains/analytics/distribution-analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/distribution")({
  head: () => ({ meta: [{ title: "Distribution Analytics — StayNas" }] }),
  component: DistributionAnalyticsPage,
});

function DistributionAnalyticsPage() {
  const fn = useServerFn(getDistributionAnalytics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics.distribution", "30d"],
    queryFn: () => fn({ data: {} }),
  });

  if (isLoading || !data) {
    if (error) return <div className="rounded-lg border p-4 text-sm text-destructive">Unable to load distribution analytics: {error.message}</div>;
    return <LoadingState />;
  }

  const o = data.operations;
  const w = data.webhooks;
  const f = data.financialEvidence;
  const h = data.health;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribution Analytics"
        description="Read-only performance projections from StayNas distribution operation, webhook, reservation, finance-evidence and health ledgers."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Distribution operations" value={o.total} />
        <StatCard label="Operation success rate" value={pct(o.successRate)} />
        <StatCard label="Retryable operation failures" value={o.retryableFailure} />
        <StatCard label="Imported reservations" value={data.reservations.imported} />
        <StatCard label="Webhook events" value={w.total} />
        <StatCard label="Processed webhooks" value={w.processed} />
        <StatCard label="Finance evidence awaiting review" value={f.unmatched + f.reviewRequired} />
        <StatCard label="Provider health checks" value={h.checks} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Operation ledger</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Succeeded</dt><dd className="font-medium">{o.succeeded}</dd></div>
            <div><dt className="text-muted-foreground">Queued / running</dt><dd className="font-medium">{o.queued + o.running}</dd></div>
            <div><dt className="text-muted-foreground">Permanent failures</dt><dd className="font-medium">{o.permanentFailure}</dd></div>
            <div><dt className="text-muted-foreground">Average attempts</dt><dd className="font-medium">{o.averageAttempts.toFixed(2)}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Financial evidence</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Total evidence</dt><dd className="font-medium">{f.total}</dd></div>
            <div><dt className="text-muted-foreground">Unmatched</dt><dd className="font-medium">{f.unmatched}</dd></div>
            <div><dt className="text-muted-foreground">Review required</dt><dd className="font-medium">{f.reviewRequired}</dd></div>
            <div><dt className="text-muted-foreground">Duplicate reference</dt><dd className="font-medium">{f.duplicateReference}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Provider evidence is not a payment posting, settlement or cash movement.</p>
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold">Provider health</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Healthy</dt><dd className="font-medium">{h.healthy}</dd></div>
            <div><dt className="text-muted-foreground">Degraded</dt><dd className="font-medium">{h.degraded}</dd></div>
            <div><dt className="text-muted-foreground">Unavailable</dt><dd className="font-medium">{h.unavailable}</dd></div>
            <div><dt className="text-muted-foreground">Unknown</dt><dd className="font-medium">{h.unknown}</dd></div>
          </dl>
        </section>
      </div>
      <p className="text-xs text-muted-foreground">
        Reporting window: last 30 days. Active-property scope only. Values are operational counts and rates; no cross-currency financial totals are calculated.
      </p>
    </div>
  );
}
