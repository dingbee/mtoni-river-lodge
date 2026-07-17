import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Badge } from "@/components/ui/badge";
import { getAiAnalytics } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/ai")({
  head: () => ({ meta: [{ title: "AI Analytics — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getAiAnalytics);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.ai"], queryFn: () => fn({ data: undefined as any }) });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="AI Analytics" description="Volume, confidence, feedback, and recommendation outcomes across every AI module." />
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total AI questions (30d)" value={data.totalQuestions} />
        <StatCard label="Avg latency" value={`${Math.round(data.avgLatency)}ms`} />
        <StatCard label="Success rate" value={`${Math.round(data.successRate * 100)}%`} />
        <StatCard label="Helpful feedback" value={data.helpfulFeedback} />
        <StatCard label="Escalations" value={data.escalations} />
        <StatCard label="Concierge sessions" value={data.conciergeSessions} />
        <StatCard label="Copilot sessions" value={data.copilotSessions} />
      </div>
      <SectionCard title="Recommendations accepted / dismissed">
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          {Object.entries(data.recommendations).map(([k, v]: any) => (
            <div key={k} className="rounded border p-3">
              <div className="font-medium capitalize">{k}</div>
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary">Accepted: {v.accepted}</Badge>
                <Badge variant="outline">Dismissed: {v.dismissed}</Badge>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Activity by module">
        <div className="space-y-1 text-sm">
          {data.byModule.map((m) => (
            <div key={m.module} className="flex items-center justify-between">
              <span>{m.module}</span>
              <span className="text-muted-foreground">{m.count} · {Math.round(m.avgLatency)}ms · {Math.round(m.successRate * 100)}% ok</span>
            </div>
          ))}
          {!data.byModule.length && <p className="text-muted-foreground">No activity yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
