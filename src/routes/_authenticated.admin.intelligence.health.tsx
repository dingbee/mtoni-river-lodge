import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Radio, Activity, Brain, Lightbulb, Check, Target, BookOpen, MessageSquare } from "lucide-react";
import { getIntelligenceHealthFn } from "@/modules/intelligence/activation/activation.functions";

export const Route = createFileRoute("/_authenticated/admin/intelligence/health")({
  head: () => ({
    meta: [
      { title: "Intelligence Health Monitor — Mtoni OS" },
      { name: "description", content: "Observability for the Mtoni Intelligence Core reasoning loop." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: HealthPage,
});

function HealthPage() {
  const healthFn = useServerFn(getIntelligenceHealthFn);
  const q = useQuery({ queryKey: ["intel.health"], queryFn: () => healthFn({ data: { windowDays: 30 } }) });
  const d = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Intelligence Health Monitor"
        description="Throughput and quality of the reasoning loop over the last 30 days."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events received" value={d?.events ?? "—"} icon={Radio} tone="info"
          hint={d ? `${d.eventsUnprocessed} awaiting reasoning` : undefined} />
        <StatCard label="Signals generated" value={d?.signals ?? "—"} icon={Activity} tone="gold" />
        <StatCard label="Insights created" value={d?.insights ?? "—"} icon={Brain} tone="green" />
        <StatCard label="Recommendations" value={d?.recommendations ?? "—"} icon={Lightbulb} tone="warn" />
        <StatCard label="Accepted" value={d?.accepted ?? "—"} icon={Check} tone="green"
          hint={d ? `${d.dismissed} dismissed` : undefined} />
        <StatCard label="Acceptance rate" value={d ? `${Math.round(d.acceptanceRate * 100)}%` : "—"} icon={Target} tone="green" />
        <StatCard
          label="Prediction accuracy"
          value={d?.predictionAccuracy !== null && d?.predictionAccuracy !== undefined ? `${Math.round(d.predictionAccuracy * 100)}%` : "—"}
          icon={Target}
          tone="info"
          hint="Scored predictions only"
        />
        <StatCard label="Memories learned" value={d?.memories ?? "—"} icon={BookOpen} tone="neutral"
          hint={d ? `${d.feedback} feedback entries` : undefined} />
      </div>

      <SectionCard title="By module" description="Where the intelligence is coming from.">
        {!d || d.byModule.length === 0 ? (
          <EmptyState title="No module activity yet" description="Modules appear here once they emit events into the core." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Module</th>
                  <th className="py-2 text-right">Events</th>
                  <th className="py-2 text-right">Insights</th>
                  <th className="py-2 text-right">Recommendations</th>
                </tr>
              </thead>
              <tbody>
                {d.byModule.map((m) => (
                  <tr key={m.module} className="border-t border-border/60">
                    <td className="py-2 capitalize text-foreground">{m.module}</td>
                    <td className="py-2 text-right tabular-nums">{m.events}</td>
                    <td className="py-2 text-right tabular-nums">{m.insights}</td>
                    <td className="py-2 text-right tabular-nums">{m.recommendations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d?.lastEventAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Last event observed {new Date(d.lastEventAt).toLocaleString()}
          </p>
        )}
      </SectionCard>
    </div>
  );
}