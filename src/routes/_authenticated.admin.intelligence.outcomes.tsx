import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge } from "lucide-react";
import {
  getIntelligenceOutcomeBoard,
  measureIntelligenceOutcomes,
} from "@/modules/intelligence/orchestration/orchestration.functions";
import type { OutcomeBoard, OutcomeRecord } from "@/modules/intelligence/orchestration/orchestration.types";

export const Route = createFileRoute("/_authenticated/admin/intelligence/outcomes")({
  head: () => ({
    meta: [
      { title: "Outcomes & Effectiveness — Mtoni OS" },
      {
        name: "description",
        content:
          "Did the decision actually work? Expected targets captured before execution, measured against reality, and fed back into the learning loop.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OutcomesPage,
});

const RESULT_TONE: Record<string, string> = {
  met: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  partially_met: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  missed: "bg-destructive/15 text-destructive",
  unavailable: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
};

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function OutcomeRow({ o }: { o: OutcomeRecord }) {
  return (
    <li className="rounded border border-border/60 bg-background/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-foreground">{o.label}</span>
        <Badge variant="secondary" className={`text-[0.6rem] ${RESULT_TONE[o.result]}`}>
          {o.result.replace("_", " ")}
        </Badge>
        <Badge variant="outline" className="text-[0.6rem] capitalize">{o.module}</Badge>
        {o.achievement !== null && (
          <Badge variant="outline" className="text-[0.6rem] tabular-nums">{pct(o.achievement)} of intent</Badge>
        )}
        <span className="ml-auto text-[0.65rem] text-muted-foreground">
          {o.measuredAt
            ? `measured ${new Date(o.measuredAt).toLocaleString()}`
            : o.measureAfter
              ? `measurable from ${new Date(o.measureAfter).toLocaleString()}`
              : ""}
        </span>
      </div>
      <p className="mt-1 text-[0.7rem] text-muted-foreground">
        {o.decisionTitle ? `${o.decisionTitle} — ` : ""}
        baseline {o.baselineValue ?? "—"} · target {o.targetValue ?? "—"} · actual {o.actualValue ?? "—"}
        {o.unit ? ` ${o.unit}` : ""}
      </p>
      {o.note && <p className="mt-1 text-[0.7rem] text-muted-foreground">{o.note}</p>}
    </li>
  );
}

function OutcomesPage() {
  const qc = useQueryClient();
  const boardFn = useServerFn(getIntelligenceOutcomeBoard);
  const measureFn = useServerFn(measureIntelligenceOutcomes);

  const q = useQuery({
    queryKey: ["intel.outcomes"],
    queryFn: () => boardFn({ data: { limit: 60 } }) as Promise<OutcomeBoard>,
  });

  const measure = useMutation({
    mutationFn: () => measureFn({ data: { limit: 50 } }),
    onSuccess: (r) => {
      toast.success(
        r.measured === 0
          ? "Nothing is due for measurement yet."
          : `${r.measured} outcome(s) measured · ${r.met} met · ${r.missed} missed.`,
      );
      qc.invalidateQueries({ queryKey: ["intel.outcomes"] });
      qc.invalidateQueries({ queryKey: ["intel.actions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const board = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Outcomes & Effectiveness"
        description="Execution success is not business success. Targets are captured before execution and scored against what actually happened."
        actions={
          <Button size="sm" onClick={() => measure.mutate()} disabled={measure.isPending}>
            <Gauge className={`mr-1.5 size-4 ${measure.isPending ? "animate-pulse" : ""}`} /> Measure due outcomes
          </Button>
        }
      />

      {board && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["Met", board.counts.met],
            ["Partially met", board.counts.partiallyMet],
            ["Missed", board.counts.missed],
            ["Pending", board.counts.pending],
            ["Unmeasurable", board.counts.unavailable],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border bg-card p-3">
              <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value as number}</p>
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Measured outcomes" description="Every target was recorded before execution — the core cannot move the goalposts afterwards.">
        {!board || board.outcomes.length === 0 ? (
          <EmptyState
            title={q.isLoading ? "Loading outcomes…" : "No outcomes recorded yet"}
            description="Outcomes appear once an approved action has been executed and its measurement window opens."
          />
        ) : (
          <ul className="space-y-2">
            {board.outcomes.map((o) => (
              <OutcomeRow key={o.id} o={o} />
            ))}
          </ul>
        )}
      </SectionCard>

      {board && board.effectiveness.length > 0 && (
        <SectionCard
          title="Decision effectiveness"
          description="Averaged only over components with evidence — a decision is never scored on assumptions."
        >
          <ul className="space-y-2">
            {board.effectiveness.map((e) => (
              <li key={e.decisionId} className="rounded border border-border/60 bg-background/40 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-foreground">{e.decisionTitle}</span>
                  <Badge variant="outline" className="text-[0.6rem] capitalize">{e.module}</Badge>
                  <Badge variant="secondary" className="ml-auto text-[0.65rem] tabular-nums">
                    effectiveness {pct(e.aggregate)}
                  </Badge>
                </div>
                <div className="mt-1.5 grid gap-1 text-[0.68rem] text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                  <span>Prediction accuracy {pct(e.predictionAccuracy)}</span>
                  <span>Acceptance {pct(e.recommendationAcceptance)}</span>
                  <span>Execution success {pct(e.executionSuccess)}</span>
                  <span>Outcome achievement {pct(e.outcomeAchievement)}</span>
                  <span>Strategic alignment {pct(e.strategicAlignment)}</span>
                </div>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  Measured from: {e.measuredComponents.join(", ") || "no evidence yet"}.
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}