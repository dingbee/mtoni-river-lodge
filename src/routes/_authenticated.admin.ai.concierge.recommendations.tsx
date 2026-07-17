import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Clock, ThumbsDown, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listRecommendations,
  updateRecommendationStatus,
  generatePreArrivalRecommendations,
  getPersonalisationMetrics,
} from "@/domains/ai/concierge/proactive.functions";

type Status = "pending" | "approved" | "completed" | "dismissed" | "all";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/recommendations")({
  head: () => ({
    meta: [
      { title: "Concierge Recommendations — Mtoni AI" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RecommendationsPage,
});

function pct(v: number | undefined | null) {
  if (v == null) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

function RecommendationsPage() {
  const [status, setStatus] = useState<Status>("pending");
  const qc = useQueryClient();
  const listFn = useServerFn(listRecommendations);
  const updateFn = useServerFn(updateRecommendationStatus);
  const genFn = useServerFn(generatePreArrivalRecommendations);
  const metricsFn = useServerFn(getPersonalisationMetrics);

  const list = useQuery({
    queryKey: ["concierge.recs", status],
    queryFn: () => listFn({ data: { status, limit: 100 } }),
  });
  const metrics = useQuery({
    queryKey: ["concierge.recs.metrics"],
    queryFn: () => metricsFn({ data: { window: "30d" } }),
  });

  const update = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "dismissed" | "completed" }) =>
      updateFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concierge.recs"] });
      qc.invalidateQueries({ queryKey: ["concierge.recs.metrics"] });
    },
  });

  const generate = useMutation({
    mutationFn: () => genFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concierge.recs"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concierge Recommendations"
        description="AI proposes; humans decide. Nothing is sent, booked, or charged without approval."
        actions={
          <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
            <PlayCircle className="mr-1 size-3.5" />
            {generate.isPending ? "Generating…" : "Generate pre-arrival"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Recommendations (30d)" value={metrics.data?.total ?? "—"} />
        <StatCard label="Acceptance" value={pct(metrics.data?.acceptance)} />
        <StatCard label="Completed" value={metrics.data?.completed ?? "—"} />
        <StatCard label="Dismissed" value={metrics.data?.dismissed ?? "—"} />
      </div>

      <div className="flex items-center gap-2">
        {(["pending", "approved", "completed", "dismissed", "all"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === status ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <SectionCard title="Queue" description="Approve, complete, or dismiss AI-generated recommendations.">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this queue.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(list.data as any[]).map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.title ?? r.item_name}</span>
                      <Badge variant="outline" className="capitalize">
                        {r.recommendation_type?.replaceAll("_", " ")}
                      </Badge>
                      <Badge variant="secondary">conf {Math.round((r.confidence ?? 0) * 100)}%</Badge>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-muted-foreground">{r.reasoning}</p>
                    {r.notes && <p className="mt-1 text-xs italic">Notes: {r.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {r.status !== "approved" && r.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: r.id, status: "approved" })}
                      >
                        Approve
                      </Button>
                    )}
                    {r.status !== "completed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update.mutate({ id: r.id, status: "completed" })}
                      >
                        Complete
                      </Button>
                    )}
                    {r.status !== "dismissed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update.mutate({ id: r.id, status: "dismissed" })}
                      >
                        Dismiss
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "pending", icon: Clock, variant: "outline" },
    approved: { label: "approved", icon: CheckCircle2, variant: "default" },
    completed: { label: "completed", icon: CheckCircle2, variant: "secondary" },
    dismissed: { label: "dismissed", icon: ThumbsDown, variant: "destructive" },
  };
  const entry = map[status] ?? map.pending;
  const Icon = entry.icon;
  return (
    <Badge variant={entry.variant} className="capitalize">
      <Icon className="mr-1 size-3" />
      {entry.label}
    </Badge>
  );
}