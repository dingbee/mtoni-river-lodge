import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { getExecutiveAnalytics } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/executive")({
  head: () => ({ meta: [{ title: "Executive Dashboard — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getExecutiveAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.executive"], queryFn: () => fn({ data: undefined as any }) });
  if (isLoading || !data) return <LoadingState />;
  const h = data.health;
  return (
    <div className="space-y-6">
      <PageHeader title="Executive Dashboard" description={data.weeklySummary} />
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Financial health" value={`${h.financialHealth}/100`} />
        <StatCard label="Operational health" value={`${h.operationalHealth}/100`} />
        <StatCard label="Marketing health" value={`${h.marketingHealth}/100`} />
        <StatCard label="Guest satisfaction" value={`${h.guestSatisfaction}/100`} />
        <StatCard label="AI health" value={`${h.aiHealth}/100`} />
      </div>
      <SectionCard title="Top opportunities">
        <div className="space-y-2 text-sm">
          {data.topOpportunities.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between">
              <span>{r.title}</span>
              <Badge variant="secondary">{r.impact ?? "—"} · {Math.round((r.confidence ?? 0) * 100)}%</Badge>
            </div>
          ))}
          {!data.topOpportunities.length && <p className="text-muted-foreground">No open recommendations.</p>}
        </div>
      </SectionCard>
      <SectionCard title="Strategic risks">
        <div className="space-y-1 text-sm">
          {data.risks.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between">
              <span>{r.title ?? r.id}</span>
              <Badge variant="outline">{r.severity} · {r.status}</Badge>
            </div>
          ))}
          {!data.risks.length && <p className="text-muted-foreground">No active risks.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
