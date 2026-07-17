import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { getExecutiveKpis, captureKpiSnapshot, getAiValueSummary } from "@/domains/ai/executive-intelligence.functions";
import { TrendingUp, DollarSign, Bed, Star, Users, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/executive/kpis")({
  head: () => ({ meta: [{ title: "Executive KPIs — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

const pct = (v: number) => `${Math.round(Number(v || 0) * 100)}%`;

function Page() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">("month");
  const kpisFn = useServerFn(getExecutiveKpis);
  const snapFn = useServerFn(captureKpiSnapshot);
  const valueFn = useServerFn(getAiValueSummary);
  const q = useQuery({ queryKey: ["ai.exec.kpis", period], queryFn: () => kpisFn({ data: { period } }) });
  const v = useQuery({ queryKey: ["ai.exec.value"], queryFn: () => valueFn() });
  const snap = useMutation({
    mutationFn: () => snapFn({ data: { period } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.exec.kpis", period] }),
  });

  const d: any = q.data;
  const val: any = v.data;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Executive KPIs"
        description="Long-term performance across occupancy, revenue, guest satisfaction, and AI-driven adoption."
        actions={
          <div className="flex items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="rounded border bg-background px-2 py-1 text-sm">
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Yearly</option>
            </select>
            <Button size="sm" onClick={() => snap.mutate()} disabled={snap.isPending}>{snap.isPending ? "Capturing…" : "Capture snapshot"}</Button>
          </div>
        }
      />
      {q.isLoading || !d ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Bed} label="Occupancy (365d)" value={pct(d.live.occupancy)} />
            <StatCard icon={DollarSign} label="ADR (365d)" value={Math.round(d.live.adr).toLocaleString()} />
            <StatCard icon={TrendingUp} label="RevPAR (365d)" value={Math.round(d.live.revpar).toLocaleString()} />
            <StatCard icon={Star} label="Avg review" value={`${(d.live.avgReview ?? 0).toFixed(2)}★`} />
            <StatCard icon={Users} label="Repeat guest %" value={pct(d.live.repeat)} />
            <StatCard icon={Bot} label="AI adoption" value={pct(d.live.aiAdoption)} hint={`${d.live.aiRunsLast90} AI runs / 90d`} />
          </div>
          <SectionCard title={`Snapshots (${d.snapshots.length})`}>
            {d.snapshots.length === 0 ? <p className="text-sm text-muted-foreground">No snapshots for this period yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1">Period</th>
                      <th>Occupancy</th>
                      <th>ADR</th>
                      <th>RevPAR</th>
                      <th>Revenue</th>
                      <th>Avg review</th>
                      <th>Bookings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.snapshots as any[]).map((s) => {
                      const k = s.kpis ?? {};
                      return (
                        <tr key={s.id} className="border-t">
                          <td className="py-1">{s.period_start} → {s.period_end}</td>
                          <td>{pct(k.occupancy)}</td>
                          <td>{Math.round(k.adr ?? 0).toLocaleString()}</td>
                          <td>{Math.round(k.revpar ?? 0).toLocaleString()}</td>
                          <td>{Math.round(k.revenue ?? 0).toLocaleString()}</td>
                          <td>{(k.avgReview ?? 0).toFixed(2)}★</td>
                          <td>{k.bookings ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          <SectionCard title="AI Value Engine">
            {v.isLoading || !val ? <p className="text-sm text-muted-foreground">Loading…</p> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                <StatCard icon={Bot} label="Recs generated (90d)" value={String(val.totals.generated)} />
                <StatCard icon={Bot} label="Accepted" value={String(val.totals.accepted)} />
                <StatCard icon={Bot} label="Converted to tasks" value={String(val.totals.converted)} />
                <StatCard icon={Bot} label="Dismissed" value={String(val.totals.dismissed)} />
                <StatCard icon={TrendingUp} label="Adoption" value={pct(val.adoption)} />
                <StatCard icon={TrendingUp} label="Estimated value" value={String(val.totals.valueEstimate)} hint="Sum of impact_score on accepted/converted" />
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}