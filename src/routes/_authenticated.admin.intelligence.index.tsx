import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, Brain, Lightbulb, ListChecks, RefreshCw, Radio, Check, X, Scale, Map } from "lucide-react";
import {
  getIntelligenceTimelineFn,
  runIntelligencePipeline,
} from "@/modules/intelligence/activation/activation.functions";
import { decideIntelligenceRecommendation } from "@/modules/intelligence/recommendations/recommendations.functions";
import type { TimelineEntry, TimelineStage } from "@/modules/intelligence/timeline/timeline.server";

export const Route = createFileRoute("/_authenticated/admin/intelligence/")({
  head: () => ({
    meta: [
      { title: "Intelligence Timeline — Mtoni OS" },
      { name: "description", content: "Live view of events, signals, insights and recommendations across Mtoni OS." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TimelinePage,
});

const STAGE_META: Record<TimelineStage, { label: string; icon: typeof Radio; tone: string }> = {
  observe: { label: "Event", icon: Radio, tone: "text-[color:var(--os-info)]" },
  understand: { label: "Signal", icon: Activity, tone: "text-[color:var(--os-gold)]" },
  reason: { label: "Insight", icon: Brain, tone: "text-[color:var(--os-green)]" },
  recommend: { label: "Recommendation", icon: Lightbulb, tone: "text-[color:var(--os-warn)]" },
  decide: { label: "Decision", icon: Scale, tone: "text-[color:var(--os-gold)]" },
  plan: { label: "Plan", icon: Map, tone: "text-[color:var(--os-info)]" },
  act: { label: "Action", icon: ListChecks, tone: "text-[color:var(--os-ink-2)]" },
  learn: { label: "Learning", icon: Brain, tone: "text-[color:var(--os-ink-2)]" },
};

const STAGES: Array<TimelineStage | "all"> = ["all", "observe", "understand", "reason", "recommend", "decide", "plan", "act"];

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });

function TimelinePage() {
  const qc = useQueryClient();
  const [stage, setStage] = useState<TimelineStage | "all">("all");
  const timelineFn = useServerFn(getIntelligenceTimelineFn);
  const pipelineFn = useServerFn(runIntelligencePipeline);
  const decideFn = useServerFn(decideIntelligenceRecommendation);

  const q = useQuery({
    queryKey: ["intel.timeline", stage],
    queryFn: () => timelineFn({ data: { stage: stage === "all" ? undefined : stage, limit: 80 } }),
  });

  const run = useMutation({
    mutationFn: () => pipelineFn({ data: { windowHours: 24 } }),
    onSuccess: (r) => {
      toast.success(
        `Pipeline run — ${r.eventsProcessed} events, ${r.signalsCreated} signals, ${r.insightsCreated} insights, ${r.predictionsRecorded} predictions, ${r.recommendationsCreated} recommendations.`,
      );
      qc.invalidateQueries({ queryKey: ["intel.timeline"] });
      qc.invalidateQueries({ queryKey: ["intel.health"] });
      qc.invalidateQueries({ queryKey: ["intel.forecast"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "accepted" | "dismissed" }) =>
      decideFn({ data: { id: v.id, decision: v.decision } }),
    onSuccess: () => {
      toast.success("Decision recorded — the core will learn from this.");
      qc.invalidateQueries({ queryKey: ["intel.timeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const entries = (q.data ?? []) as TimelineEntry[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mtoni Intelligence Timeline"
        description="Every event, signal, insight and recommendation in one chronological view — with the reasoning behind each conclusion."
        actions={
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw className={`mr-1.5 size-4 ${run.isPending ? "animate-spin" : ""}`} />
            Run reasoning pass
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1 text-sm">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`rounded px-3 py-1.5 capitalize ${
              stage === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {s === "all" ? "All stages" : STAGE_META[s].label}
          </button>
        ))}
      </div>

      <SectionCard title="Activity" description={q.isFetching ? "Refreshing…" : `${entries.length} entries`}>
        {entries.length === 0 ? (
          <EmptyState
            title="No intelligence activity yet"
            description="Events flow in automatically as staff work in Mtoni OS. Run a reasoning pass once events have been observed."
          />
        ) : (
          <ol className="space-y-3">
            {entries.map((e) => {
              const meta = STAGE_META[e.stage];
              const Icon = meta.icon;
              const isRec = e.id.startsWith("recommendation:");
              const recId = isRec ? e.id.slice("recommendation:".length) : null;
              return (
                <li key={e.id} className="flex gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="w-14 shrink-0 text-right">
                    <p className="text-sm tabular-nums text-foreground">{time(e.at)}</p>
                    <p className="text-[0.65rem] text-muted-foreground">{day(e.at)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className={`size-4 ${meta.tone}`} />
                      <span className="text-sm font-medium text-foreground">{e.title}</span>
                      <Badge variant="outline" className="text-[0.65rem] capitalize">{meta.label}</Badge>
                      <Badge variant="secondary" className="text-[0.65rem] uppercase">{e.module}</Badge>
                      {e.status && <Badge variant="outline" className="text-[0.65rem] capitalize">{e.status}</Badge>}
                      {e.confidence !== null && e.confidence !== undefined && (
                        <span className="text-[0.65rem] text-muted-foreground">
                          confidence {Math.round(Number(e.confidence) * 100)}%
                        </span>
                      )}
                    </div>
                    {e.detail && <p className="mt-1 text-sm text-muted-foreground">{e.detail}</p>}
                    {e.reasoningSources.length > 0 && (
                      <p className="mt-1 text-[0.68rem] text-muted-foreground">
                        Why: {e.reasoningSources.join(" · ")}
                      </p>
                    )}
                    {isRec && recId && (e.status === "new" || e.status === "reviewing") && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="secondary" disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: recId, decision: "accepted" })}>
                          <Check className="mr-1 size-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: recId, decision: "dismissed" })}>
                          <X className="mr-1 size-3.5" /> Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}