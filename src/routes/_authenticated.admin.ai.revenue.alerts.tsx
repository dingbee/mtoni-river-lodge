import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scanRevenueAlerts, listRevenueAlerts, actionRevenueAlert } from "@/domains/ai/revenue-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/revenue/alerts")({
  head: () => ({ meta: [{ title: "Revenue Alerts — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const scanFn = useServerFn(scanRevenueAlerts);
  const listFn = useServerFn(listRevenueAlerts);
  const actFn  = useServerFn(actionRevenueAlert);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["ai.revenue.alerts"], queryFn: () => listFn() });
  const scan = useMutation({ mutationFn: () => scanFn(), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.revenue.alerts"] }) });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "dismiss"|"convert"|"assign" }) => actFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.revenue.alerts"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Revenue Alerts"
        description="Occupancy, cancellation, unpaid balance, surge, and overbooking signals."
        actions={<Button size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>{scan.isPending ? "Scanning…" : "Scan now"}</Button>}
      />
      <SectionCard title="Open alerts">
        {list.isLoading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> :
         !list.data?.length ? <div className="p-3 text-sm text-muted-foreground">All clear. Run a scan to refresh.</div> :
         <ul className="divide-y">
           {(list.data as any[]).map((a) => (
             <li key={a.id} className="flex items-start justify-between gap-3 py-3 text-sm">
               <div>
                 <div className="flex items-center gap-2">
                   <Badge variant={a.severity === "critical" ? "destructive" : a.severity === "warning" ? "default" : "secondary"}>{a.severity}</Badge>
                   <span className="font-medium">{a.title}</span>
                 </div>
                 <div className="text-xs text-muted-foreground">{a.detail}</div>
               </div>
               <div className="flex shrink-0 gap-1">
                 <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "assign" })}>Assign me</Button>
                 <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "dismiss" })}>Dismiss</Button>
                 <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "convert" })}>Task</Button>
               </div>
             </li>
           ))}
         </ul>}
      </SectionCard>
    </div>
  );
}