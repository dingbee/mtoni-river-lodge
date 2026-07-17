import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getConciergeAnalytics,
  getConciergeOutcomes,
  getKnowledgeGaps,
  classifyConciergeOutcomes,
  listConciergeInsights,
  updateConciergeInsight,
} from "@/domains/ai/concierge/analytics.functions";

type Window = "7d" | "30d" | "90d";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/analytics")({
  head: () => ({
    meta: [{ title: "Concierge Analytics — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AnalyticsPage,
});

function pct(v: number | undefined | null) {
  if (v == null) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

function AnalyticsPage() {
  const [win, setWin] = useState<Window>("30d");
  const qc = useQueryClient();
  const analyticsFn = useServerFn(getConciergeAnalytics);
  const outcomesFn = useServerFn(getConciergeOutcomes);
  const gapsFn = useServerFn(getKnowledgeGaps);
  const classifyFn = useServerFn(classifyConciergeOutcomes);
  const insightsFn = useServerFn(listConciergeInsights);
  const updateInsightFn = useServerFn(updateConciergeInsight);

  const analytics = useQuery({ queryKey: ["concierge.analytics", win], queryFn: () => analyticsFn({ data: { window: win } }) });
  const outcomes = useQuery({ queryKey: ["concierge.outcomes", win], queryFn: () => outcomesFn({ data: { window: win } }) });
  const gaps = useQuery({ queryKey: ["concierge.gaps", win], queryFn: () => gapsFn({ data: { window: win } }) });
  const insights = useQuery({ queryKey: ["concierge.insights"], queryFn: () => insightsFn() });

  const classify = useMutation({
    mutationFn: () => classifyFn({ data: { window: win } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["concierge.outcomes", win] });
      qc.invalidateQueries({ queryKey: ["concierge.analytics", win] });
    },
  });

  const updateInsight = useMutation({
    mutationFn: (v: { id: string; status: string }) => updateInsightFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concierge.insights"] }),
  });

  const a = analytics.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concierge Analytics"
        description="Measurable hospitality conversion intelligence for Mtoni AI Concierge."
        actions={
          <div className="flex items-center gap-2">
            {(["7d", "30d", "90d"] as const).map((w) => (
              <Button key={w} size="sm" variant={w === win ? "default" : "outline"} onClick={() => setWin(w)}>
                {w}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => classify.mutate()} disabled={classify.isPending}>
              <RefreshCw className="mr-1 size-3.5" /> {classify.isPending ? "Classifying…" : "Classify outcomes"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Conversations" value={a?.overview.sessions ?? "—"} />
        <StatCard label="Avg. messages" value={a?.overview.avg_messages_per_session ?? "—"} />
        <StatCard label="Avg. confidence" value={pct(a?.overview.avg_confidence)} />
        <StatCard label="Escalation rate" value={pct(a?.overview.escalation_rate)} />
        <StatCard label="Conversion rate" value={pct(a?.conversion.conversion_rate)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Conversion metrics">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Booking intents" value={a?.conversion.booking_intents} />
            <Stat label="Booking clicks" value={a?.conversion.booking_clicks} />
            <Stat label="Leads captured" value={a?.conversion.leads} />
            <Stat label="Assisted bookings" value={a?.conversion.assisted_bookings} />
          </dl>
        </SectionCard>

        <SectionCard title="Concierge health score">
          <div className="space-y-2">
            <HealthBar label="Accuracy" value={a?.health.accuracy} />
            <HealthBar label="Engagement" value={a?.health.engagement} />
            <HealthBar label="Conversion" value={a?.health.conversion} />
            <HealthBar label="Experience" value={a?.health.experience} />
            <HealthBar label="Overall" value={a?.health.overall} highlight />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Conversation outcomes" description="Classified session outcomes across the selected window.">
        {(outcomes.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No classified outcomes yet. Run <em>Classify outcomes</em> to backfill.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {outcomes.data?.map((o) => (
              <div key={o.outcome_type} className="rounded-md border bg-card px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground capitalize">{o.outcome_type.replaceAll("_", " ")}</p>
                <p className="text-xl font-semibold">{o.count}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Knowledge gaps" description="Repeated low-confidence or escalated AI responses.">
        {(gaps.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No repeated low-confidence responses in this window.</p>
        ) : (
          <ul className="divide-y text-sm">
            {gaps.data?.map((g) => (
              <li key={g.key} className="py-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate">{g.sample}</p>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{g.occurrences}×</Badge>
                    {g.escalations > 0 && <Badge variant="destructive">{g.escalations} esc</Badge>}
                    <span>conf {g.avg_confidence ?? "—"}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Insight review queue" description="Approve or dismiss AI-generated hospitality insights.">
        {(insights.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No insights recorded yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {insights.data?.map((i: any) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{i.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.question_count ?? 0} questions · {i.escalation_count ?? 0} escalations
                    {i.category ? ` · ${i.category}` : ""}
                  </p>
                  {i.recommended_action && (
                    <p className="mt-1 text-xs">Recommend: {i.recommended_action}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline">{i.status ?? "new"}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => updateInsight.mutate({ id: i.id, status: "accepted" })}>
                    Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateInsight.mutate({ id: i.id, status: "dismissed" })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value ?? "—"}</dd>
    </div>
  );
}

function HealthBar({ label, value, highlight }: { label: string; value: number | undefined; highlight?: boolean }) {
  const v = Math.round(Number(value ?? 0) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={highlight ? "font-semibold" : "text-muted-foreground"}>{label}</span>
        <span className={highlight ? "font-semibold" : ""}>{v}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${highlight ? "bg-primary" : "bg-primary/70"}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}