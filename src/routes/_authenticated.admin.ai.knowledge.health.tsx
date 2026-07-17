import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, Gauge, RefreshCw, Sparkles, Timer } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  getKnowledgeHealth,
  getFreshnessReport,
  getKnowledgeGaps,
  getKnowledgeCoverage,
  getContentRecommendations,
  getSourceQualityList,
  recomputeQualityScores,
  listKnowledgeNotifications,
  dismissKnowledgeNotification,
  listSyncRuns,
  getSchedulerConfig,
  triggerScheduledSync,
} from "@/domains/ai/knowledge-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/knowledge/health")({
  head: () => ({
    meta: [
      { title: "Knowledge Health — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: KnowledgeHealth,
});

function pct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}
function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString() : "—";
}

function KnowledgeHealth() {
  const qc = useQueryClient();
  const healthFn = useServerFn(getKnowledgeHealth);
  const freshFn = useServerFn(getFreshnessReport);
  const gapsFn = useServerFn(getKnowledgeGaps);
  const covFn = useServerFn(getKnowledgeCoverage);
  const recsFn = useServerFn(getContentRecommendations);
  const qualityFn = useServerFn(getSourceQualityList);
  const notifsFn = useServerFn(listKnowledgeNotifications);
  const runsFn = useServerFn(listSyncRuns);
  const cfgFn = useServerFn(getSchedulerConfig);
  const health = useQuery({ queryKey: ["ki.health"], queryFn: () => healthFn() });
  const fresh = useQuery({ queryKey: ["ki.fresh"], queryFn: () => freshFn() });
  const gaps = useQuery({ queryKey: ["ki.gaps"], queryFn: () => gapsFn() });
  const cov = useQuery({ queryKey: ["ki.cov"], queryFn: () => covFn() });
  const recs = useQuery({ queryKey: ["ki.recs"], queryFn: () => recsFn() });
  const quality = useQuery({ queryKey: ["ki.quality"], queryFn: () => qualityFn({ data: { limit: 25 } }) });
  const notifs = useQuery({ queryKey: ["ki.notifs"], queryFn: () => notifsFn({ data: { status: "open" } }) });
  const runs = useQuery({ queryKey: ["ki.runs"], queryFn: () => runsFn() });
  const cfg = useQuery({ queryKey: ["ki.cfg"], queryFn: () => cfgFn() });

  const dismissFn = useServerFn(dismissKnowledgeNotification);
  const triggerFn = useServerFn(triggerScheduledSync);
  const recomputeFn = useServerFn(recomputeQualityScores);

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ki.notifs"] }); },
  });
  const trigger = useMutation({
    mutationFn: () => triggerFn(),
    onSuccess: (r: any) => {
      toast.success(r?.status === "failed" ? "Sync completed with errors" : "Knowledge sync complete");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });
  const recompute = useMutation({
    mutationFn: () => recomputeFn(),
    onSuccess: (r: any) => {
      toast.success(`Quality recomputed for ${r?.updated ?? 0} sources`);
      qc.invalidateQueries({ queryKey: ["ki.quality"] });
      qc.invalidateQueries({ queryKey: ["ki.health"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Recompute failed"),
  });

  const h = health.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Knowledge Health"
        description="Monitor freshness, coverage, gaps and quality of the AI knowledge base."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={recompute.isPending} onClick={() => recompute.mutate()}>
              <Gauge className="mr-1.5 size-4" /> Recompute quality
            </Button>
            <Button size="sm" disabled={trigger.isPending} onClick={() => trigger.mutate()}>
              <RefreshCw className={`mr-1.5 size-4 ${trigger.isPending ? "animate-spin" : ""}`} /> Run sync now
            </Button>
          </div>
        }
      />

      {health.isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Health score" value={pct(h?.healthScore)} icon={Gauge} />
          <StatCard label="Approved sources" value={String(h?.totals.approved ?? 0)} icon={Sparkles} />
          <StatCard label="Pending review" value={String(h?.totals.pending ?? 0)} icon={AlertTriangle} />
          <StatCard label="Failed syncs" value={String(h?.totals.failed ?? 0)} icon={AlertTriangle} />
          <StatCard label="Stale sources" value={String(h?.totals.stale ?? 0)} icon={Timer} />
          <StatCard label="Archived" value={String(h?.totals.archived ?? 0)} icon={Timer} />
          <StatCard label="Avg age (days)" value={String(h?.averageAgeDays ?? 0)} icon={Timer} />
          <StatCard label="Last sync" value={fmt(h?.lastRun?.started_at)} icon={RefreshCw} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Freshness" description="Approved sources by staleness bucket">
          {fresh.isLoading ? <LoadingState /> : (
            <>
              <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs">
                {(["fresh", "needs_review", "stale", "outdated"] as const).map((b) => (
                  <div key={b} className="rounded border bg-card p-2">
                    <div className="text-lg font-semibold">{fresh.data?.summary[b] ?? 0}</div>
                    <div className="text-muted-foreground capitalize">{b.replace("_", " ")}</div>
                  </div>
                ))}
              </div>
              <div className="max-h-72 overflow-auto divide-y">
                {(fresh.data?.rows ?? [])
                  .filter((r) => r.bucket !== "fresh")
                  .slice(0, 25)
                  .map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.source_type} · {r.age_days ?? "—"}d / warn {r.warning_days}d</div>
                      </div>
                      <Badge variant={r.bucket === "outdated" ? "destructive" : "secondary"} className="capitalize">
                        {r.bucket.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                {(fresh.data?.rows ?? []).every((r) => r.bucket === "fresh") && (
                  <EmptyState icon={Sparkles} title="All sources fresh" description="Nothing needs review right now." />
                )}
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard title="Coverage by category">
          {cov.isLoading ? <LoadingState /> : (
            <div className="space-y-2 text-sm">
              {(cov.data ?? []).length === 0 ? (
                <EmptyState icon={Sparkles} title="No sources yet" description="Run a sync to populate the knowledge base." />
              ) : (cov.data ?? []).map((c) => (
                <div key={c.source_type} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="capitalize">{c.source_type.replace("_", " ")}</span>
                    <span className="text-xs text-muted-foreground">{c.approved}/{c.total} · {pct(c.coverage)}</span>
                  </div>
                  <Progress value={Math.round(c.coverage * 100)} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Knowledge gaps" description="Repeated / low-confidence / unanswered queries (60d)">
          {gaps.isLoading ? <LoadingState /> : (
            <div className="max-h-72 overflow-auto divide-y">
              {(gaps.data?.gaps ?? []).length === 0 ? (
                <EmptyState icon={Sparkles} title="No gaps detected" description="AI answers are landing." />
              ) : (gaps.data?.gaps ?? []).map((g) => (
                <div key={g.query} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{g.query}</div>
                    <div className="text-xs text-muted-foreground">
                      Asked {g.asked} · confidence {pct(g.confidence)} · {g.no_result} no-result
                    </div>
                  </div>
                  <Badge variant={g.no_result > 0 ? "destructive" : "secondary"}>
                    {g.no_result > 0 ? "Missing" : "Weak"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Content recommendations" description="AI-suggested content the team could add (staff decides)">
          {recs.isLoading ? <LoadingState /> : (
            <div className="max-h-72 overflow-auto divide-y">
              {(recs.data ?? []).length === 0 ? (
                <EmptyState icon={Sparkles} title="No recommendations" description="Nothing pressing right now." />
              ) : (recs.data ?? []).map((r) => (
                <div key={r.query} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">Create {r.suggested_type.replace("_", " ")} for “{r.query}”</div>
                    <div className="text-xs text-muted-foreground">
                      Asked {r.asked} · confidence {pct(r.confidence)}
                    </div>
                  </div>
                  <Badge
                    variant={r.priority === "high" ? "destructive" : r.priority === "medium" ? "default" : "secondary"}
                  >
                    {r.priority}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Lowest-quality sources" description="Ranked by composite quality score">
          {quality.isLoading ? <LoadingState /> : (
            <div className="max-h-80 overflow-auto divide-y">
              {(quality.data ?? []).length === 0 ? (
                <EmptyState icon={Sparkles} title="No sources scored yet" description="Click Recompute quality." />
              ) : (quality.data ?? []).map((s: any) => (
                <div key={s.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 truncate font-medium">{s.title}</div>
                    <Badge variant="outline">{pct(s.quality_score)}</Badge>
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                    <span>C {pct(s.completeness_score)}</span>
                    <span>F {pct(s.freshness_score)}</span>
                    <span>U {pct(s.usage_score)}</span>
                    <span>K {pct(s.confidence_score)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Notifications" description="Informational alerts — no auto-actions">
          {notifs.isLoading ? <LoadingState /> : (
            <div className="max-h-80 overflow-auto divide-y">
              {(notifs.data ?? []).length === 0 ? (
                <EmptyState icon={Bell} title="No open notifications" description="You're up to date." />
              ) : (notifs.data ?? []).map((n: any) => (
                <div key={n.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{n.title}</div>
                    <div className="text-xs text-muted-foreground">{n.message}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{fmt(n.created_at)} · {n.notification_type}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => dismiss.mutate(n.id)} disabled={dismiss.isPending}>
                    Dismiss
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Recent sync runs" description={cfg.data ? `Schedule: ${cfg.data.cron_expression} · ${cfg.data.enabled ? "enabled" : "disabled"} · confidence ≥ ${pct(cfg.data.confidence_threshold)}` : undefined}>
        {runs.isLoading ? <LoadingState /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Started</th><th className="p-2">Status</th><th className="p-2">Trigger</th><th className="p-2">Tasks</th><th className="p-2">Error</th></tr>
              </thead>
              <tbody>
                {(runs.data ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{fmt(r.started_at)}</td>
                    <td className="p-2">
                      <Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                    </td>
                    <td className="p-2 text-xs">{r.triggered_by}</td>
                    <td className="p-2 text-xs">{(r.result?.tasks ?? []).map((t: any) => `${t.task}:${t.upserted}`).join(" · ")}</td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[240px]">{r.error ?? ""}</td>
                  </tr>
                ))}
                {(runs.data ?? []).length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">No runs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}