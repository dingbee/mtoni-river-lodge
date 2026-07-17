import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateRevenueForecast, listRevenueForecasts } from "@/domains/ai/revenue-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue/forecast")({
  head: () => ({ meta: [{ title: "Revenue Forecast — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const genFn = useServerFn(generateRevenueForecast);
  const listFn = useServerFn(listRevenueForecasts);
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState<7 | 30 | 90>(30);
  const [latest, setLatest] = useState<any>(null);
  const list = useQuery({ queryKey: ["ai.revenue.forecasts"], queryFn: () => listFn() });
  const gen = useMutation({
    mutationFn: () => genFn({ data: { horizon, persist: true } }),
    onSuccess: (d) => { setLatest(d); qc.invalidateQueries({ queryKey: ["ai.revenue.forecasts"] }); },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="AI Revenue Forecast" description="Deterministic projection blending confirmed reservations, pending pipeline, and 365-day history. Never presented as certainty." />
      <SectionCard>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Horizon:</span>
          {[7,30,90].map((h) => (
            <Button key={h} size="sm" variant={horizon === h ? "default" : "outline"} onClick={() => setHorizon(h as 7|30|90)}>{h} days</Button>
          ))}
          <Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending} className="ml-auto">
            {gen.isPending ? "Generating…" : "Generate forecast"}
          </Button>
        </div>
      </SectionCard>

      {latest && (
        <SectionCard title={`Latest forecast (${latest.horizon} days)`}>
          <div className="grid gap-3 md:grid-cols-3">
            <div><div className="text-xs text-muted-foreground">Expected revenue</div><div className="text-xl font-semibold">${Math.round(latest.expectedRevenue).toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Expected occupancy</div><div className="text-xl font-semibold">{Math.round(latest.expectedOccupancy * 100)}%</div></div>
            <div><div className="text-xs text-muted-foreground">Confidence</div><div className="text-xl font-semibold">{Math.round(latest.confidence * 100)}%</div></div>
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Assumptions</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {latest.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          </div>
          <div className="mt-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Evidence</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {latest.evidence.map((e: any, i: number) => (
                <Badge key={i} variant="outline" className="font-mono text-xs">{e.source}</Badge>
              ))}
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Recent forecasts">
        {list.isLoading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> :
         !list.data?.length ? <div className="p-3 text-sm text-muted-foreground">No forecasts generated yet.</div> :
         <ul className="divide-y">
           {(list.data as any[]).map((f) => (
             <li key={f.id} className="flex items-center justify-between py-2 text-sm">
               <div>
                 <div className="font-medium">{f.horizon_days}-day forecast · {new Date(f.created_at).toLocaleString()}</div>
                 <div className="text-xs text-muted-foreground">${Math.round(Number(f.expected_revenue)).toLocaleString()} · occ {Math.round(Number(f.expected_occupancy)*100)}% · conf {Math.round(Number(f.confidence)*100)}%</div>
               </div>
             </li>
           ))}
         </ul>
        }
      </SectionCard>
    </div>
  );
}