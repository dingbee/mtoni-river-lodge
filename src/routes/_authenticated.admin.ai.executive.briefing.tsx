import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLatestBriefing, generateExecutiveBriefing } from "@/domains/ai/executive-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/executive/briefing")({
  head: () => ({ meta: [{ title: "Morning Briefing — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const latestFn = useServerFn(getLatestBriefing);
  const genFn = useServerFn(generateExecutiveBriefing);
  const q = useQuery({ queryKey: ["ai.exec.briefing"], queryFn: () => latestFn() });
  const gen = useMutation({ mutationFn: () => genFn(), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.exec.briefing"] }) });

  const b = q.data as any;
  const s = b?.sections ?? null;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Morning Executive Briefing"
        description="Deterministic overnight synthesis of every AI domain. Regenerate any time; results are cached per day."
        actions={<Button onClick={() => gen.mutate()} disabled={gen.isPending}>{gen.isPending ? "Generating…" : "Regenerate now"}</Button>}
      />
      {q.isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : !b ? (
        <SectionCard title="No briefing yet">
          <p className="text-sm text-muted-foreground">Click <strong>Regenerate now</strong> to build today's briefing.</p>
        </SectionCard>
      ) : (
        <>
          <SectionCard title={`Summary · ${b.briefing_date}`}>
            <p className="text-sm">{b.summary}</p>
          </SectionCard>
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Operations">
              <List label="Arrivals" items={s?.operations?.arrivals} render={(r: any) => `${r.reference} · ${r.guest_name}`} />
              <List label="Departures" items={s?.operations?.departures} render={(r: any) => `${r.reference} · ${r.guest_name}`} />
              <List label="Open tasks" items={s?.operations?.openTasks} render={(r: any) => `[P${r.priority}] ${r.title}`} />
              <List label="Open alerts" items={s?.operations?.openAlerts} render={(r: any) => `[${r.severity}] ${r.message}`} />
            </SectionCard>
            <SectionCard title="Guests">
              <List label="VIP/climber today" items={s?.guests?.vipToday} render={(r: any) => `${r.guest_name} · ${r.guest_type}`} />
              <List label="Recommendations" items={s?.guests?.recommendations} render={(r: any) => `${r.title}`} />
              <List label="Alerts" items={s?.guests?.alerts} render={(r: any) => `[${r.severity}] ${r.title}`} />
            </SectionCard>
            <SectionCard title="Revenue">
              <List label="Forecasts" items={s?.revenue?.forecasts} render={(f: any) => `${f.horizon_days}d — occ ${(Number(f.expected_occupancy) * 100).toFixed(0)}% · rev ${f.currency} ${Math.round(Number(f.expected_revenue ?? 0)).toLocaleString()}`} />
              <List label="Pricing" items={s?.revenue?.pricing} render={(r: any) => `${r.action?.toUpperCase()} — ${r.title}`} />
              <List label="Opportunities" items={s?.revenue?.opportunities} render={(r: any) => r.title} />
              <List label="Alerts" items={s?.revenue?.alerts} render={(r: any) => `[${r.severity}] ${r.title}`} />
            </SectionCard>
            <SectionCard title="Marketing">
              <List label="Priorities" items={s?.marketing?.priorities} render={(r: any) => r.title} />
              <List label="Recommendations" items={s?.marketing?.recommendations} render={(r: any) => r.title} />
              {s?.marketing?.reputation && (
                <p className="mt-2 text-xs text-muted-foreground">Reputation: {s.marketing.reputation.avg_rating}★ over {s.marketing.reputation.review_count} reviews</p>
              )}
            </SectionCard>
          </div>
          <SectionCard title="Top AI Recommendations">
            {(b.top_recommendations ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {(b.top_recommendations as any[]).map((r, i) => (
                  <li key={r.id} className="rounded border p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{i + 1}.</span>
                      <span className="font-medium">{r.title}</span>
                      <Badge variant="outline">{r.origin}</Badge>
                      <Badge variant="outline">impact {Number(r.impact_score ?? 0)}</Badge>
                      <Badge variant="outline">conf {Math.round(Number(r.confidence ?? 0) * 100)}%</Badge>
                    </div>
                    {r.reasoning && <p className="mt-1 text-muted-foreground">{r.reasoning}</p>}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
          {s?.risks?.length ? (
            <SectionCard title="Strategic Risks">
              <ul className="space-y-1 text-sm">
                {(s.risks as any[]).map((r) => (
                  <li key={r.id}><Badge variant="outline" className="mr-2">{r.severity}</Badge>{r.title}</li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}

function List({ label, items, render }: { label: string; items: any[] | undefined; render: (r: any) => string }) {
  const arr = Array.isArray(items) ? items : [];
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label} ({arr.length})</div>
      {arr.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : (
        <ul className="space-y-0.5 text-sm">{arr.map((r, i) => <li key={r.id ?? i}>{render(r)}</li>)}</ul>
      )}
    </div>
  );
}