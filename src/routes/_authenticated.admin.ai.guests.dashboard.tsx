import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Cake, Heart, CreditCard, Users, Sparkles, ArrowRight } from "lucide-react";
import { getGuestDashboard, actionGuestAlert } from "@/domains/ai/guest-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/guests/dashboard")({
  head: () => ({ meta: [{ title: "Daily Guest Intelligence — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const fn = useServerFn(getGuestDashboard);
  const actFn = useServerFn(actionGuestAlert);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ai.guest.dashboard"], queryFn: () => fn() });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "dismiss" | "convert" }) => actFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.guest.dashboard"] }),
  });
  const d = q.data as any;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Daily Guest Intelligence"
        description="Every arrival, alert, and opportunity for the next 14 days."
        actions={<Button asChild variant="outline" size="sm"><Link to="/admin/ai/guests">Back to arrivals</Link></Button>}
      />
      {q.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : !d ? (
        <div className="p-6 text-sm text-destructive">Failed to load dashboard.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label="Today's arrivals" value={String(d.todayArrivals.length)} />
            <StatCard icon={Sparkles} label="VIP arrivals (14d)" value={String(d.vipArrivals.length)} />
            <StatCard icon={CreditCard} label="Outstanding balances" value={String(d.outstandingBalances.length)} />
            <StatCard icon={AlertTriangle} label="Open alerts" value={String(d.openAlerts.length)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Today's arrivals">
              {d.todayArrivals.length === 0 ? <Empty>No arrivals today.</Empty> : (
                <ul className="divide-y">
                  {d.todayArrivals.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <div className="font-medium">{a.guest_name}</div>
                        <div className="text-xs text-muted-foreground">{a.reference} · {a.check_in} → {a.check_out}</div>
                      </div>
                      <Button asChild size="sm" variant="ghost"><Link to="/admin/ai/guests/$bookingId" params={{ bookingId: a.id }}><ArrowRight className="size-4" /></Link></Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Birthdays & anniversaries during stay">
              {(d.birthdays.length + d.anniversaries.length) === 0 ? <Empty>None coming up.</Empty> : (
                <ul className="space-y-2 text-sm">
                  {d.birthdays.map((a: any) => (
                    <li key={a.id} className="flex items-start gap-2"><Cake className="mt-0.5 size-4 text-primary" /><div><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{a.detail}</div></div></li>
                  ))}
                  {d.anniversaries.map((a: any) => (
                    <li key={a.id} className="flex items-start gap-2"><Heart className="mt-0.5 size-4 text-primary" /><div><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{a.detail}</div></div></li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Smart alerts">
              {d.openAlerts.length === 0 ? <Empty>No open alerts.</Empty> : (
                <ul className="divide-y">
                  {d.openAlerts.slice(0, 12).map((a: any) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2"><Badge variant={a.severity === "critical" ? "destructive" : a.severity === "warning" ? "default" : "secondary"}>{a.severity}</Badge><span className="font-medium">{a.title}</span></div>
                        <div className="text-xs text-muted-foreground">{a.detail}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "dismiss" })}>Dismiss</Button>
                        <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: "convert" })}>Task</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Experience opportunities">
              {d.opportunities.length === 0 ? <Empty>No opportunities pending.</Empty> : (
                <ul className="divide-y">
                  {d.opportunities.slice(0, 10).map((o: any) => (
                    <li key={o.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{o.title}</div>
                        <Badge variant="outline">conf {Math.round(Number(o.confidence ?? 0) * 100)}%</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{o.reasoning}</div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">{children}</div>;
}