import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateAnalyticsRecommendations, listAnalyticsRecommendations, setAnalyticsRecommendationStatus } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/recommendations")({
  head: () => ({ meta: [{ title: "AI Recommendations — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAnalyticsRecommendations);
  const gen = useServerFn(generateAnalyticsRecommendations);
  const setStatus = useServerFn(setAnalyticsRecommendationStatus);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.recs"], queryFn: () => listFn({ data: undefined as any }) });
  const genM = useMutation({
    mutationFn: () => gen({ data: undefined as any }),
    onSuccess: (r: any) => { toast.success(`Generated ${r.created} recommendations.`); qc.invalidateQueries({ queryKey: ["analytics.recs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const statusM = useMutation({
    mutationFn: (p: { id: string; status: any }) => setStatus({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analytics.recs"] }),
  });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="AI Recommendation Engine" description="Analytics-driven recommendations with reasoning, evidence, and impact." />
      <div className="flex justify-end">
        <Button onClick={() => genM.mutate()} disabled={genM.isPending}>{genM.isPending ? "Generating…" : "Generate from trends"}</Button>
      </div>
      <SectionCard title="Open recommendations">
        <div className="space-y-3 text-sm">
          {data.map((r: any) => (
            <div key={r.id} className="rounded border p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-muted-foreground text-xs">{r.reasoning}</div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Badge>{r.impact ?? "—"}</Badge>
                  <Badge variant="outline">{Math.round((r.confidence ?? 0) * 100)}%</Badge>
                </div>
              </div>
              {r.suggested_action && <p className="text-xs">→ {r.suggested_action}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={r.status !== "open"} onClick={() => statusM.mutate({ id: r.id, status: "accepted" })}>Accept</Button>
                <Button size="sm" variant="ghost" disabled={r.status !== "open"} onClick={() => statusM.mutate({ id: r.id, status: "dismissed" })}>Dismiss</Button>
                <Badge variant="outline">{r.status}</Badge>
              </div>
            </div>
          ))}
          {!data.length && <p className="text-muted-foreground">No recommendations yet — click Generate.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
