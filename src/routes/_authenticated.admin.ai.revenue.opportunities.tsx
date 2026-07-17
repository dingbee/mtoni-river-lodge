import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scanRevenueOpportunities, listRevenueOpportunities, actionRevenueOpportunity } from "@/domains/ai/revenue-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue/opportunities")({
  head: () => ({ meta: [{ title: "Revenue Opportunities — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const scanFn = useServerFn(scanRevenueOpportunities);
  const listFn = useServerFn(listRevenueOpportunities);
  const actFn  = useServerFn(actionRevenueOpportunity);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["ai.revenue.opps"], queryFn: () => listFn() });
  const scan = useMutation({ mutationFn: () => scanFn(), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.revenue.opps"] }) });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "accept"|"dismiss"|"convert" }) => actFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.revenue.opps"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revenue Opportunities"
        description="Upsell, cross-sell, and leakage opportunities with estimated impact and evidence."
        actions={<Button size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>{scan.isPending ? "Scanning…" : "Scan now"}</Button>}
      />
      <SectionCard title="Open opportunities">
        {list.isLoading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> :
         !list.data?.length ? <div className="p-3 text-sm text-muted-foreground">No opportunities pending. Run a scan.</div> :
         <ul className="divide-y">
           {(list.data as any[]).map((o) => (
             <li key={o.id} className="space-y-1 py-3 text-sm">
               <div className="flex flex-wrap items-center gap-2">
                 <Badge>{o.kind}</Badge>
                 <span className="font-medium">{o.title}</span>
                 <Badge variant="outline">conf {Math.round(Number(o.confidence)*100)}%</Badge>
                 <span className="ml-auto font-medium">~${Math.round(Number(o.estimated_impact ?? 0)).toLocaleString()}</span>
               </div>
               <div className="text-muted-foreground">{o.detail}</div>
               {o.recommended_action && <div className="text-xs"><b>Recommended:</b> {o.recommended_action}</div>}
               <div className="flex gap-2 pt-1">
                 <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: o.id, action: "accept" })}>Accept</Button>
                 <Button size="sm" variant="ghost"   disabled={act.isPending} onClick={() => act.mutate({ id: o.id, action: "dismiss" })}>Dismiss</Button>
                 <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: o.id, action: "convert" })}>Convert to task</Button>
               </div>
             </li>
           ))}
         </ul>}
      </SectionCard>
    </div>
  );
}