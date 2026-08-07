import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Gauge, Target, CheckCircle2, Play, TrendingUp, BookOpen, AlertTriangle } from "lucide-react";
import { getIntelligenceQualityFn } from "@/modules/intelligence/quality/quality.functions";
import type { QualityMetricKey } from "@/modules/intelligence/quality/quality.types";

export const Route = createFileRoute("/_authenticated/admin/intelligence/quality")({
  head: () => ({
    meta: [
      { title: "Intelligence Quality Metrics — Mtoni OS" },
      { name: "description", content: "Accuracy, acceptance, success and learning metrics for the Mtoni Intelligence Core." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: QualityPage,
});

const ICONS: Record<QualityMetricKey, typeof Target> = {
  prediction_accuracy: Target,
  recommendation_acceptance: CheckCircle2,
  decision_success: Gauge,
  action_completion: Play,
  outcome_achievement: TrendingUp,
  learning_effectiveness: BookOpen,
};

const fmt = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

function QualityPage() {
  const fn = useServerFn(getIntelligenceQualityFn);
  const q = useQuery({
    queryKey: ["intel.quality", 30],
    queryFn: () => fn({ data: { windowDays: 30 } }),
  });
  const d = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Intelligence Quality Metrics"
        description="Is the reasoning loop actually working? Measured over the last 30 days from recorded evidence only."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Composite quality"
          value={fmt(d?.compositeScore ?? null)}
          icon={Gauge}
          tone="gold"
          hint={d?.headline}
          className="sm:col-span-2 xl:col-span-3"
        />
        {(d?.metrics ?? []).map((m) => {
          const Icon = ICONS[m.key];
          const below = m.value !== null && m.value < m.target;
          return (
            <StatCard
              key={m.key}
              label={m.label}
              value={fmt(m.value)}
              icon={Icon}
              tone={m.value === null ? "neutral" : below ? "warn" : "green"}
              hint={`${m.detail} Target ${Math.round(m.target * 100)}%.`}
            />
          );
        })}
      </div>

      <SectionCard title="How each metric is calculated" description="Formulas are fixed so the numbers cannot be reframed after the fact.">
        {!d ? (
          <EmptyState title="Loading metrics" description="Reading recorded predictions, decisions, actions and outcomes." />
        ) : (
          <div className="space-y-3">
            {d.metrics.map((m) => (
              <div key={m.key} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{m.label}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {fmt(m.value)} · sample {m.sample}
                  </span>
                </div>
                <Progress value={(m.value ?? 0) * 100} className="mt-2 h-1.5" />
                <p className="mt-2 text-xs text-muted-foreground">{m.formula}</p>
                <p className="text-xs text-muted-foreground">{m.detail}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="By module" description="Where decisions are being made and measured.">
        {!d || d.byModule.length === 0 ? (
          <EmptyState title="No module decisions yet" description="Modules appear here once decisions or outcomes are recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Module</th>
                  <th className="py-2 text-right">Decisions</th>
                  <th className="py-2 text-right">Approved</th>
                  <th className="py-2 text-right">Completed</th>
                  <th className="py-2 text-right">Outcomes</th>
                  <th className="py-2 text-right">Achievement</th>
                </tr>
              </thead>
              <tbody>
                {d.byModule.map((m) => (
                  <tr key={m.module} className="border-t border-border/60">
                    <td className="py-2 capitalize text-foreground">{m.module}</td>
                    <td className="py-2 text-right tabular-nums">{m.decisions}</td>
                    <td className="py-2 text-right tabular-nums">{m.approved}</td>
                    <td className="py-2 text-right tabular-nums">{m.completed}</td>
                    <td className="py-2 text-right tabular-nums">{m.outcomesMeasured}</td>
                    <td className="py-2 text-right tabular-nums">{fmt(m.achievement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {d && d.attention.length > 0 && (
        <SectionCard title="Needs attention" description="Metrics below target or without enough evidence.">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {d.attention.map((a) => (
              <li key={a} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color:var(--os-warn)]" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}