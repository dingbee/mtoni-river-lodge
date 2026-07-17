import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generatePricingRecommendations, listPricingRecommendations, actionPricingRecommendation } from "@/domains/ai/revenue-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue/pricing")({
  head: () => ({ meta: [{ title: "Pricing Advisor — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const genFn = useServerFn(generatePricingRecommendations);
  const listFn = useServerFn(listPricingRecommendations);
  const actFn = useServerFn(actionPricingRecommendation);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["ai.revenue.pricing"], queryFn: () => listFn() });
  const gen = useMutation({ mutationFn: () => genFn({ data: { persist: true } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.revenue.pricing"] }) });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "accept"|"dismiss"|"convert" }) => actFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.revenue.pricing"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pricing Advisor"
        description="Rule-based pricing suggestions with evidence. No prices are changed automatically — every recommendation must be reviewed."
        actions={<Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>{gen.isPending ? "Analyzing…" : "Run advisor"}</Button>}
      />
      <SectionCard title="Recommendations">
        {list.isLoading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> :
         !list.data?.length ? <div className="p-3 text-sm text-muted-foreground">No pricing recommendations yet. Run the advisor.</div> :
         <ul className="divide-y">
           {(list.data as any[]).map((r) => (
             <li key={r.id} className="space-y-1 py-3 text-sm">
               <div className="flex flex-wrap items-center gap-2">
                 <Badge variant={r.action === "increase" ? "default" : r.action === "decrease" ? "destructive" : "secondary"}>{r.action}</Badge>
                 <span className="font-medium">{r.rooms?.name ?? "—"}</span>
                 <span className="text-muted-foreground">{r.window_from} → {r.window_to}</span>
                 <Badge variant="outline">conf {Math.round(Number(r.confidence)*100)}%</Badge>
                 {r.status !== "pending" && <Badge variant="outline">{r.status}</Badge>}
                 <span className="ml-auto text-muted-foreground">{r.current_rate} → <b>{r.suggested_rate}</b></span>
               </div>
               <div className="text-muted-foreground">{r.reasoning}</div>
               <div className="text-xs text-muted-foreground">Expected impact: ${Math.round(Number(r.expected_impact ?? 0)).toLocaleString()}</div>
               {r.status === "pending" && (
                 <div className="flex gap-2 pt-1">
                   <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "accept" })}>Accept</Button>
                   <Button size="sm" variant="ghost"   disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "dismiss" })}>Dismiss</Button>
                   <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "convert" })}>Convert to task</Button>
                 </div>
               )}
             </li>
           ))}
         </ul>}
      </SectionCard>
    </div>
  );
}