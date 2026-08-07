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
import { AlertTriangle, Check, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  executeIntelligenceAction,
  getIntelligenceActionBoard,
  governIntelligenceAction,
  verifyIntelligenceAction,
} from "@/modules/intelligence/orchestration/orchestration.functions";
import {
  ACTION_RISK_LABEL,
  CAPABILITY_LABEL,
  type ActionBoard,
  type ActionRisk,
  type ActionState,
  type ExecuteActionResult,
  type OrchestratedAction,
} from "@/modules/intelligence/orchestration/orchestration.types";
import { EXECUTION_ADAPTERS } from "@/modules/intelligence/orchestration/executionAdapter";

export const Route = createFileRoute("/_authenticated/admin/intelligence/actions")({
  head: () => ({
    meta: [
      { title: "Action Orchestration — Mtoni OS" },
      {
        name: "description",
        content:
          "Approve, execute and verify intelligence actions. Every execution is idempotent, adapter-bound and checked against live business context.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ActionsPage,
});

const RISK_TONE: Record<ActionRisk, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  critical: "bg-destructive/15 text-destructive",
};

const STATUS_LABEL: Partial<Record<ActionState, string>> = {
  draft: "Draft",
  proposed: "Awaiting approval",
  pending_approval: "Awaiting approval",
  approved: "Approved — ready to execute",
  queued: "Queued",
  executing: "Executing",
  completed: "Executed",
  failed: "Failed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

function ActionCard({
  a,
  busy,
  onGovern,
  onExecute,
  onVerify,
}: {
  a: OrchestratedAction;
  busy: boolean;
  onGovern: (v: { actionId: string; decision: "approve" | "reject" | "cancel" }) => void;
  onExecute: (v: { actionId: string; retry: boolean; acceptContextDrift: boolean }) => void;
  onVerify: (actionId: string) => void;
}) {
  const awaiting = a.status === "pending_approval" || a.status === "proposed" || a.status === "draft";
  const executable = a.status === "approved" || a.status === "queued";
  const canRetry = a.status === "failed" && a.retryCount < a.maxRetries && (a.risk === "low" || a.risk === "medium");

  return (
    <li className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{a.title ?? a.actionType}</span>
        <Badge variant="outline" className="text-[0.65rem] capitalize">{a.module}</Badge>
        <Badge className={`text-[0.65rem] ${RISK_TONE[a.risk]}`} variant="secondary" title={ACTION_RISK_LABEL[a.risk]}>
          {a.risk} risk
        </Badge>
        <Badge variant="secondary" className="text-[0.65rem]">{STATUS_LABEL[a.status] ?? a.status}</Badge>
        {a.contextStatus === "stale" && (
          <Badge variant="destructive" className="text-[0.65rem]">context stale</Badge>
        )}
        {a.contextStatus === "shifted" && (
          <Badge variant="outline" className="text-[0.65rem]">context shifted</Badge>
        )}
      </div>

      <p className="mt-1 text-[0.72rem] text-muted-foreground">
        {a.capability ? CAPABILITY_LABEL[a.capability] : "No adapter bound"}
        {a.decisionTitle ? ` · from “${a.decisionTitle}”` : ""}
        {a.planStepSequence !== null ? ` · plan step ${a.planStepSequence}` : ""}
      </p>

      {a.executionReference && (
        <p className="mt-1 text-[0.68rem] text-muted-foreground">
          Handed to the {a.adapter} module — reference <span className="font-mono">{a.executionReference}</span>
        </p>
      )}
      {a.error && (
        <p className="mt-1 flex items-start gap-1.5 text-[0.7rem] text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {a.error}
          {a.retryCount > 0 ? ` (attempt ${a.retryCount} of ${a.maxRetries})` : ""}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {awaiting && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onGovern({ actionId: a.id, decision: "approve" })}>
              <Check className="mr-1 size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onGovern({ actionId: a.id, decision: "reject" })}>
              <X className="mr-1 size-3.5" /> Reject
            </Button>
          </>
        )}
        {executable && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onExecute({ actionId: a.id, retry: false, acceptContextDrift: false })}>
              <Play className="mr-1 size-3.5" /> Execute
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onExecute({ actionId: a.id, retry: false, acceptContextDrift: true })}
            >
              Execute anyway
            </Button>
          </>
        )}
        {canRetry && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onExecute({ actionId: a.id, retry: true, acceptContextDrift: false })}>
            <RefreshCw className="mr-1 size-3.5" /> Retry
          </Button>
        )}
        {a.status === "completed" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onVerify(a.id)}>
            <ShieldCheck className="mr-1 size-3.5" /> Verify outcome
          </Button>
        )}
      </div>
    </li>
  );
}

function ActionsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending_approval" | "approved" | "completed" | "failed">("all");
  const boardFn = useServerFn(getIntelligenceActionBoard);
  const governFn = useServerFn(governIntelligenceAction);
  const executeFn = useServerFn(executeIntelligenceAction);
  const verifyFn = useServerFn(verifyIntelligenceAction);

  const q = useQuery({
    queryKey: ["intel.actions", filter],
    queryFn: () =>
      boardFn({ data: { limit: 60, ...(filter === "all" ? {} : { status: filter }) } }) as Promise<ActionBoard>,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["intel.actions"] });
    qc.invalidateQueries({ queryKey: ["intel.outcomes"] });
    qc.invalidateQueries({ queryKey: ["intel.timeline"] });
  };

  const govern = useMutation({
    mutationFn: (v: { actionId: string; decision: "approve" | "reject" | "cancel" }) => governFn({ data: v }),
    onSuccess: () => {
      toast.success("Recorded.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const execute = useMutation({
    mutationFn: (v: { actionId: string; retry: boolean; acceptContextDrift: boolean }) =>
      executeFn({ data: v }) as Promise<ExecuteActionResult>,
    onSuccess: (r) => {
      if (r.ok) toast.success(r.message);
      else if (r.duplicate) toast.info(r.message);
      else toast.error(r.message);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: (actionId: string) => verifyFn({ data: { actionId } }),
    onSuccess: (r) => {
      toast.success(
        r.measured === 0
          ? "Nothing is measurable yet — the measurement window has not opened."
          : `${r.measured} outcome(s) measured · ${r.met} met · ${r.missed} missed.`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const board = q.data;
  const busy = govern.isPending || execute.isPending || verify.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Action Orchestration"
        description="Approved decisions become bounded commands. Mtoni hands each one to the module that owns the work, exactly once, and never changes operational data itself."
        actions={
          <Button size="sm" variant="secondary" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-1.5 size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      {board && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Awaiting approval", board.counts.pendingApproval],
            ["Ready / queued", board.counts.queued],
            ["Executing", board.counts.executing],
            ["Executed", board.counts.completed],
            ["Failed", board.counts.failed],
            ["Awaiting verification", board.counts.verificationPending],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border bg-card p-3">
              <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value as number}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1 text-sm">
        {(["all", "pending_approval", "approved", "completed", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1.5 ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {f === "all" ? "All" : (STATUS_LABEL[f] ?? f)}
          </button>
        ))}
      </div>

      <SectionCard title="Actions" description="Every state change is recorded; execution is idempotent per decision, plan step and action.">
        {!board || board.actions.length === 0 ? (
          <EmptyState
            title={q.isLoading ? "Loading actions…" : "No actions here"}
            description="Approve a decision on the Decisions board and prepare it for execution to create actions."
          />
        ) : (
          <ul className="space-y-2">
            {board.actions.map((a) => (
              <ActionCard
                key={a.id}
                a={a}
                busy={busy}
                onGovern={(v) => govern.mutate(v)}
                onExecute={(v) => execute.mutate(v)}
                onVerify={(id) => verify.mutate(id)}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Execution adapters"
        description="A module can only be asked to do what it has declared. Anything else is refused before it reaches the module."
      >
        <ul className="grid gap-2 md:grid-cols-2">
          {EXECUTION_ADAPTERS.map((ad) => (
            <li key={ad.key} className="rounded border border-border/60 bg-background/40 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-foreground">{ad.label}</span>
                <Badge variant={ad.available ? "outline" : "secondary"} className="text-[0.6rem]">
                  {ad.available ? "available" : "not implemented"}
                </Badge>
              </div>
              <p className="mt-1 text-[0.68rem] text-muted-foreground">
                {ad.capabilities.length ? ad.capabilities.map((c) => CAPABILITY_LABEL[c]).join(" · ") : "No capabilities registered."}
              </p>
              {ad.note && <p className="mt-1 text-[0.68rem] text-muted-foreground">{ad.note}</p>}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}