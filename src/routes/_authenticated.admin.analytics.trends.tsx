import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { computeTrends, listTrends } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/trends")({
  head: () => ({ meta: [{ title: "Trend Engine — Mtoni OS" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTrends);
  const computeFn = useServerFn(computeTrends);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.trends"], queryFn: () => listFn({ data: undefined as any }) });
  const m = useMutation({
    mutationFn: () => computeFn({ data: undefined as any }),
    onSuccess: (r: any) => { toast.success(`Computed ${r.computed} trend snapshots.`); qc.invalidateQueries({ queryKey: ["analytics.trends"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Trend Engine" description="7 / 30 / 90 / 365-day comparisons for revenue, bookings, and room nights." />
      <div className="flex justify-end">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Computing…" : "Compute trends"}</Button>
      </div>
      <SectionCard title="Latest snapshots">
        <div className="space-y-1 text-sm">
          {data.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between">
              <span>{t.domain} · {t.metric} · {t.window_days}d</span>
              <Badge variant={t.direction === "up" ? "default" : t.direction === "down" ? "destructive" : "outline"}>
                {t.direction} {t.delta_pct ? `${Math.round(Number(t.delta_pct))}%` : ""}
              </Badge>
            </div>
          ))}
          {!data.length && <p className="text-muted-foreground">No snapshots yet — click Compute trends.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
