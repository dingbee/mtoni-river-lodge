import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { getOperationsAnalytics } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/operations")({
  head: () => ({ meta: [{ title: "Operations Analytics — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getOperationsAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.operations"], queryFn: () => fn({ data: undefined as any }) });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Operations Analytics" description="Task completion, room readiness, and service recovery." />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Tasks total (30d)" value={data.tasksTotal} />
        <StatCard label="Tasks completed" value={data.tasksCompleted} />
        <StatCard label="Completion rate" value={`${Math.round(data.completionRate * 100)}%`} />
        <StatCard label="Open alerts" value={data.alertsOpen} />
        <StatCard label="Service recovery" value={data.recoveryCases} />
        <StatCard label="Readiness insights" value={data.readinessInsights} />
      </div>
    </div>
  );
}
