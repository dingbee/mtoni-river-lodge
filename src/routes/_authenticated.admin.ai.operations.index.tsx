import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import {
  generateOperationsBriefing,
  listOperationsBriefings,
  detectOperationsAlerts,
  listOperationsAlerts,
} from "@/domains/ai/operations/operations.functions";
import { getOperationsPressureSummary } from "@/domains/ai/operations/intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/")({
  component: OperationsCommandCentre,
});

function OperationsCommandCentre() {
  const qc = useQueryClient();
  const listBriefings = useServerFn(listOperationsBriefings);
  const generate = useServerFn(generateOperationsBriefing);
  const detect = useServerFn(detectOperationsAlerts);
  const listAlerts = useServerFn(listOperationsAlerts);

  const briefingsQ = useQuery({
    queryKey: ["ops-briefings"],
    queryFn: () => listBriefings({ data: { limit: 7 } }),
  });
  const alertsQ = useQuery({
    queryKey: ["ops-ai-alerts", "open"],
    queryFn: () => listAlerts({ data: { status: "open" } }),
  });
  const pressureFn = useServerFn(getOperationsPressureSummary);
  const pressureQ = useQuery({
    queryKey: ["ops-pressure"],
    queryFn: () => pressureFn({ data: undefined as any }),
  });

  const gen = useMutation({
    mutationFn: () => generate({ data: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-briefings"] }),
  });
  const det = useMutation({
    mutationFn: () => detect({ data: undefined as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-ai-alerts"] }),
  });

  const latest: any = briefingsQ.data?.[0];
  const m = latest?.metrics ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations AI Command Centre"
        description="Daily operational intelligence — AI suggests, staff decide."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => det.mutate()} disabled={det.isPending}>
              {det.isPending ? "Scanning…" : "Detect Alerts"}
            </Button>
            <Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>
              {gen.isPending ? "Generating…" : "Generate Briefing"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { k: "Arrivals", v: m.arrivals ?? 0 },
          { k: "Departures", v: m.departures ?? 0 },
          { k: "Open Tasks", v: m.open_tasks ?? 0 },
          { k: "Overdue", v: m.overdue_tasks ?? 0 },
          { k: "Priority Arrivals", v: m.vip_arrivals ?? 0 },
          { k: "Open Alerts", v: alertsQ.data?.length ?? 0 },
        ].map((c) => (
          <div key={c.k} className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">{c.k}</div>
            <div className="mt-1 font-display text-2xl">{c.v}</div>
          </div>
        ))}
      </div>

      <SectionCard title="Operational Pressure" description="Live counts of AI recommendations awaiting review.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: "Room Readiness", v: pressureQ.data?.readiness_pending ?? 0, to: "/admin/ai/operations/readiness" },
            { k: "Service Recovery", v: pressureQ.data?.recovery_pending ?? 0, to: "/admin/ai/operations/service-quality" },
            { k: "Operational Patterns", v: pressureQ.data?.patterns_pending ?? 0, to: "/admin/ai/operations/patterns" },
            { k: "Staff Insights", v: pressureQ.data?.staff_pending ?? 0, to: "/admin/ai/operations/staff" },
          ].map((c) => (
            <a
              key={c.k}
              href={c.to}
              className="rounded-lg border bg-card p-4 transition hover:border-primary/40 hover:bg-muted/50"
            >
              <div className="text-xs text-muted-foreground">{c.k}</div>
              <div className="mt-1 font-display text-2xl">{c.v}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">pending review</div>
            </a>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Today's Briefing" description={latest?.briefing_date ?? "No briefing yet — generate one."}>
        {latest ? (
          <div className="space-y-4 text-sm">
            <p className="leading-relaxed">{latest.summary}</p>
            {!!latest.priorities?.length && (
              <div>
                <h3 className="mb-2 font-medium">Priorities</h3>
                <ul className="space-y-2">
                  {latest.priorities.map((p: any, i: number) => (
                    <li key={i} className="rounded border bg-muted/40 p-3">
                      <div className="font-medium">{p.title}</div>
                      {p.detail && <div className="text-xs text-muted-foreground">{p.detail}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!latest.risks?.length && (
              <div>
                <h3 className="mb-2 font-medium">Risks</h3>
                <ul className="space-y-2">
                  {latest.risks.map((p: any, i: number) => (
                    <li key={i} className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
                      <div className="font-medium">{p.title}</div>
                      {p.detail && <div className="text-xs text-muted-foreground">{p.detail}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!latest.recommendations?.length && (
              <div>
                <h3 className="mb-2 font-medium">Recommendations</h3>
                <ul className="space-y-2">
                  {latest.recommendations.map((p: any, i: number) => (
                    <li key={i} className="rounded border p-3">
                      <div className="font-medium">{p.title}</div>
                      {p.reasoning && <div className="text-xs text-muted-foreground">{p.reasoning}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Click Generate Briefing to synthesise today's overview.</p>
        )}
      </SectionCard>

      <SectionCard title="Open Operational Alerts">
        {alertsQ.data && alertsQ.data.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {alertsQ.data.map((a: any) => (
              <li key={a.id} className="rounded border p-3">
                <div className="flex justify-between gap-3">
                  <div className="font-medium">{a.title}</div>
                  <span className="text-xs uppercase text-muted-foreground">{a.severity}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{a.reasoning}</div>
                {a.recommended_action && (
                  <div className="mt-1 text-xs">→ {a.recommended_action}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No open alerts.</p>
        )}
      </SectionCard>

      <SectionCard title="Recent Briefings">
        <ul className="space-y-1 text-sm">
          {(briefingsQ.data ?? []).map((b: any) => (
            <li key={b.id} className="flex justify-between border-b py-1 last:border-0">
              <span>{b.briefing_date}</span>
              <span className="text-muted-foreground">
                {b.metrics?.arrivals ?? 0} arr · {b.metrics?.departures ?? 0} dep · {b.metrics?.open_tasks ?? 0} tasks
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}