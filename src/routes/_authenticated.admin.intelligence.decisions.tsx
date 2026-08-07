import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronRight, RefreshCw, ShieldAlert, X } from "lucide-react";
import {
  decideDecisionFn,
  getDecisionBoardFn,
  runDecisionPassFn,
  updatePlanStepFn,
} from "@/modules/intelligence/decisions/decision.functions";
import {
  DECISION_DOMAIN_LABEL,
  type Decision,
  type DecisionBoard,
  type EvaluatedOption,
  type StoredDecision,
} from "@/modules/intelligence/decisions/decision.types";

export const Route = createFileRoute("/_authenticated/admin/intelligence/decisions")({
  head: () => ({
    meta: [
      { title: "Decision Intelligence — Mtoni OS" },
      {
        name: "description",
        content:
          "Ranked decisions with options considered, trade-offs, constraints, confidence, risks and the resulting action plan.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DecisionsPage,
});

const pctOf = (n: number) => `${Math.round(n * 100)}%`;

function OptionRow({ o, recommended }: { o: EvaluatedOption; recommended: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={`rounded-lg border p-3 ${
        recommended ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background/40"
      } ${o.excluded ? "opacity-60" : ""}`}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2 text-left">
        {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {o.rank}. {o.option.title}
            </span>
            {recommended && <Badge className="text-[0.65rem]">Recommended</Badge>}
            {o.excluded && <Badge variant="destructive" className="text-[0.65rem]">Excluded</Badge>}
            <Badge variant="outline" className="text-[0.65rem] tabular-nums">score {Math.round(o.finalScore * 100)}</Badge>
            {o.penalty > 0 && (
              <Badge variant="secondary" className="text-[0.65rem] tabular-nums">
                −{Math.round(o.penalty * 100)} constraint
              </Badge>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{o.option.summary}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-6">
          <div className="grid gap-1.5">
            {o.criteria.map((c) => (
              <div key={c.criterion} className="flex items-center gap-2 text-[0.72rem]">
                <span className="w-44 shrink-0 text-muted-foreground">{c.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                  <span className="block h-full bg-primary/70" style={{ width: `${c.score * 100}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
                  {Math.round(c.score * 100)} × {Math.round(c.weight * 100)}%
                </span>
              </div>
            ))}
          </div>
          {o.penalties.length > 0 && (
            <ul className="space-y-1">
              {o.penalties.map((p) => (
                <li key={p.constraintKey} className="flex gap-1.5 text-[0.72rem] text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <span className="text-foreground">{p.label}</span> — {p.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(o.strengths.length > 0 || o.tradeOffs.length > 0) && (
            <p className="text-[0.72rem] text-muted-foreground">
              Trade-offs: {[...o.strengths, ...o.tradeOffs].join(" · ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((i) => (
          <li key={i} className="text-sm text-muted-foreground">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DecisionCard({
  d,
  stored,
  onDecide,
  onStep,
  busy,
}: {
  d: Decision | StoredDecision;
  stored: StoredDecision | null;
  onDecide: (v: { id: string; decision: "approved" | "rejected" | "completed" }) => void;
  onStep: (v: { stepId: string; status: "done" | "in_progress" }) => void;
  busy: boolean;
}) {
  const rec = d.options.find((o) => o.option.key === d.recommendedOptionKey) ?? null;
  const steps = stored?.planSteps ?? d.plan.steps.map((s) => ({ ...s, id: "" }));

  return (
    <SectionCard
      title={d.title}
      description={`${DECISION_DOMAIN_LABEL[d.domain]} · ${d.trigger}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[0.65rem] capitalize">risk {d.riskLevel}</Badge>
        <Badge variant="outline" className="text-[0.65rem] tabular-nums">confidence {pctOf(d.confidence)}</Badge>
        <Badge variant="secondary" className="text-[0.65rem] uppercase">{d.module}</Badge>
        {stored && <Badge variant="outline" className="text-[0.65rem] capitalize">{stored.status}</Badge>}
        {d.requiresApproval && <Badge variant="outline" className="text-[0.65rem]">Approval required</Badge>}
      </div>

      <div className="mt-3 space-y-3">
        <Block title="What is happening" items={[d.reasoning.whatIsHappening]} />
        <Block title="Why it matters" items={[d.reasoning.whyItMatters]} />
        <Block title="What is likely" items={[d.reasoning.whatIsLikely]} />
        {d.reasoning.narrative && <Block title="In short" items={[d.reasoning.narrative]} />}
      </div>

      <div className="mt-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Options considered</p>
        <ul className="mt-1.5 space-y-1.5">
          {d.options.map((o) => (
            <OptionRow key={o.option.key} o={o} recommended={o.option.key === d.recommendedOptionKey} />
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Block title="Why this option" items={[d.reasoning.whySelected]} />
        <Block title="Expected outcome" items={d.expectedOutcomes} />
        <Block title="What could go wrong" items={d.risks} />
        <Block title="Assumptions" items={d.assumptions} />
        <Block title="Uncertainty" items={d.uncertainties} />
        <Block
          title="Constraints applied"
          items={d.constraints.map((c) => `${c.label} (${c.source.replace("_", " ")}) — ${c.description}`)}
        />
      </div>

      <div className="mt-4">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          Action plan{rec ? ` — ${rec.option.title}` : ""}
        </p>
        <ol className="mt-1.5 space-y-1.5">
          {steps.map((s) => (
            <li
              key={`${s.sequence}-${s.title}`}
              className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-background/40 p-2 text-sm"
            >
              <span className="tabular-nums text-muted-foreground">{s.sequence}.</span>
              <span className="text-foreground">{s.title}</span>
              <span className="text-[0.68rem] text-muted-foreground">{s.responsibleRole}</span>
              {s.requiresApproval && <Badge variant="outline" className="text-[0.6rem]">approval</Badge>}
              <Badge variant="secondary" className="ml-auto text-[0.6rem] capitalize">{s.status}</Badge>
              {stored && s.id && s.status !== "done" && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStep({ stepId: s.id, status: "done" })}>
                  Mark done
                </Button>
              )}
            </li>
          ))}
        </ol>
      </div>

      {stored && (stored.status === "proposed" || stored.status === "approved") && (
        <div className="mt-4 flex flex-wrap gap-2">
          {stored.status === "proposed" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onDecide({ id: stored.id, decision: "approved" })}>
                <Check className="mr-1 size-3.5" /> Approve decision
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide({ id: stored.id, decision: "rejected" })}>
                <X className="mr-1 size-3.5" /> Reject
              </Button>
            </>
          )}
          {stored.status === "approved" && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide({ id: stored.id, decision: "completed" })}>
              Record outcome as completed
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function DecisionsPage() {
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState(14);
  const boardFn = useServerFn(getDecisionBoardFn);
  const passFn = useServerFn(runDecisionPassFn);
  const decideFn = useServerFn(decideDecisionFn);
  const stepFn = useServerFn(updatePlanStepFn);

  const q = useQuery({
    queryKey: ["intel.decisions", horizon],
    queryFn: () => boardFn({ data: { horizonDays: horizon, includeStored: true } }) as Promise<DecisionBoard>,
  });

  const run = useMutation({
    mutationFn: () => passFn({ data: { horizonDays: horizon, persist: true } }),
    onSuccess: (r) => {
      toast.success(`${r.decisionsEvaluated} decisions evaluated · ${r.decisionsRecorded} recorded · ${r.plansCreated} plans created.`);
      qc.invalidateQueries({ queryKey: ["intel.decisions"] });
      qc.invalidateQueries({ queryKey: ["intel.timeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" | "completed" }) => decideFn({ data: v }),
    onSuccess: () => {
      toast.success("Recorded — the plan and the learning loop have been updated.");
      qc.invalidateQueries({ queryKey: ["intel.decisions"] });
      qc.invalidateQueries({ queryKey: ["intel.timeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const step = useMutation({
    mutationFn: (v: { stepId: string; status: "done" | "in_progress" }) => stepFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intel.decisions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const board = q.data;
  const storedByKey = new Map((board?.stored ?? []).map((s) => [s.key, s]));
  const busy = decide.isPending || step.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Decision Intelligence"
        description="Mtoni evaluates every realistic response to a predicted situation, scores them against weighted criteria and strategic constraints, then proposes a plan for approval."
        actions={
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw className={`mr-1.5 size-4 ${run.isPending ? "animate-spin" : ""}`} />
            Run decision pass
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1 text-sm">
        {[7, 14, 30].map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            className={`rounded px-3 py-1.5 ${horizon === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {h} days
          </button>
        ))}
      </div>

      {!board ? (
        <SectionCard title="Decisions">
          <EmptyState
            title={q.isLoading ? "Evaluating options…" : "No decisions available"}
            description="Decisions are derived from the current business context and the prediction engine."
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Headline" description={`Generated ${new Date(board.generated_at).toLocaleString()}`}>
            <p className="text-sm text-muted-foreground">{board.headline}</p>
          </SectionCard>

          {board.decisions.length === 0 ? (
            <SectionCard title="Decisions">
              <EmptyState title="Nothing requires a decision" description="No prediction is currently material enough to warrant a decision." />
            </SectionCard>
          ) : (
            board.decisions.map((d) => (
              <DecisionCard
                key={d.key}
                d={d}
                stored={storedByKey.get(d.key) ?? null}
                onDecide={(v) => decide.mutate(v)}
                onStep={(v) => step.mutate(v)}
                busy={busy}
              />
            ))
          )}

          {board.stored.filter((s) => !board.decisions.some((d) => d.key === s.key)).length > 0 && (
            <SectionCard title="Decision history" description="Earlier decisions and their approval state.">
              <ul className="space-y-1.5">
                {board.stored
                  .filter((s) => !board.decisions.some((d) => d.key === s.key))
                  .map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-background/40 p-2 text-sm">
                      <span className="text-foreground">{s.title}</span>
                      <Badge variant="outline" className="text-[0.65rem] capitalize">{s.status}</Badge>
                      <Badge variant="secondary" className="text-[0.65rem] tabular-nums">confidence {pctOf(s.confidence)}</Badge>
                      <span className="ml-auto text-[0.65rem] text-muted-foreground">
                        {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}