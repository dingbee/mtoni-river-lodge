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
import { getConciergeOperationalIntelligence } from "@/domains/ai/concierge/operational-intelligence.functions";

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
  const operationalFn = useServerFn(getConciergeOperationalIntelligence);
  const updateInsightFn = useServerFn(updateConciergeInsight);

  const analytics = useQuery({ queryKey: ["concierge.analytics", win], queryFn: () => analyticsFn({ data: { window: win } }) });
  const outcomes = useQuery({ queryKey: ["concierge.outcomes", win], queryFn: () => outcomesFn({ data: { window: win } }) });
  const gaps = useQuery({ queryKey: ["concierge.gaps", win], queryFn: () => gapsFn({ data: { window: win } }) });
  const insights = useQuery({ queryKey: ["concierge.insights"], queryFn: () => insightsFn() });
  const operational = useQuery({ queryKey: ["concierge.operational", win], queryFn: () => operationalFn({ data: { window: win } }) });

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
  const ops = operational.data;

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
            <Stat label="Booking attributions (unverified)" value={a?.conversion.booking_attributions_unverified} />
          </dl>
        </SectionCard>

        <SectionCard title="Measurement integrity">
          <p className="text-sm text-muted-foreground">
            Booking clicks and attribution labels are not counted as confirmed bookings.
            Factual accuracy and conversion rates remain unavailable until verified booking
            outcomes and a human-labelled answer evaluation dataset are linked to source records.
          </p>
        </SectionCard>
      </div>

      <SectionCard title="Escalation SLA performance" description="Property-configured acknowledgement, assignment and resolution targets; alert delivery is in-app.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active overdue escalations" value={ops?.sla.active_overdue_escalations} />
          <Stat label="Approaching-breach alerts" value={ops?.sla.approaching_alerts} />
          <Stat label="Breach alerts" value={ops?.sla.breached_alerts} />
          <Stat label="Lifecycle events" value={ops?.sla.lifecycle_events} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(["assignment","acknowledgement","resolution"] as const).map((milestone) => (
            <div key={milestone} className="rounded border p-3">
              <div className="text-xs capitalize text-muted-foreground">{milestone} SLA</div>
              <div className="text-lg font-semibold">
                {ops?.sla.by_milestone[milestone].compliance_rate == null
                  ? "—"
                  : pct(ops.sla.by_milestone[milestone].compliance_rate)}
              </div>
              <div className="text-xs text-muted-foreground">
                {ops?.sla.by_milestone[milestone].met ?? 0} met / {ops?.sla.by_milestone[milestone].completed ?? 0} completed
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {ops?.sla.policy_priorities_configured ?? 0} enabled priority policies · In-app staff alerts · Edit targets and operating calendar in Escalations.
        </p>
      </SectionCard>

      <SectionCard title="Operational response performance" description={`Evidence-backed omnichannel response intervals · ${ops?.timezone ?? "property timezone"}`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="First response P50 (min)" value={ops?.operations.first_response_minutes.p50 ?? undefined} />
          <Stat label="First response P90 (min)" value={ops?.operations.first_response_minutes.p90 ?? undefined} />
          <Stat label="AI response P50 (min)" value={ops?.operations.ai_response_minutes.p50 ?? undefined} />
          <Stat label="Human response P50 (min)" value={ops?.operations.human_response_minutes.p50 ?? undefined} />
          <Stat label="Unanswered conversations" value={ops?.operations.unanswered_conversations} />
          <Stat label="Eligible messages" value={ops?.operations.omnichannel_messages} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Response samples: {ops?.operations.first_response_minutes.sample_size ?? "—"} · {ops?.operations.response_metric_note ?? "Operational source is loading."}
        </p>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Escalation operations" description="Current status counts and recorded resolution intervals.">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total escalations" value={ops?.escalations.total} />
            <Stat label="Median acknowledgement (min)" value={ops?.escalations.median_acknowledgement_minutes ?? undefined} />
            <Stat label="Open" value={ops?.escalations.by_status.open} />
            <Stat label="Assigned" value={ops?.escalations.by_status.assigned} />
            <Stat label="In progress" value={ops?.escalations.by_status.in_progress} />
            <Stat label="Resolved" value={ops?.escalations.by_status.resolved} />
            <Stat label="Median resolution (min)" value={ops?.escalations.median_resolution_minutes ?? undefined} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{ops?.escalations.limitation ?? "Escalation evidence is loading."}</p>
        </SectionCard>
        <SectionCard title="Knowledge operations" description="Published content and retrieval activity; not a factual-accuracy score.">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Documents" value={ops?.knowledge.documents} />
            <Stat label="Published" value={ops?.knowledge.published_documents} />
            <Stat label="Current published chunks" value={ops?.knowledge.current_published_chunks} />
            <Stat label="Retrieval searches" value={ops?.knowledge.retrieval_searches} />
            <Stat label="Zero-result searches" value={ops?.knowledge.zero_result_searches} />
            <Stat label="Assistant answers" value={ops?.knowledge.assistant_answers} />
            <Stat label="Answers with validated citations" value={ops?.knowledge.answers_with_validated_citations} />
            <Stat label="Validated citation coverage (%)" value={ops?.knowledge.validated_citation_coverage == null ? undefined : Number((ops.knowledge.validated_citation_coverage * 100).toFixed(1))} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{ops?.knowledge.limitation ?? "Knowledge evidence is loading."}</p>
        </SectionCard>
      </div>

      <SectionCard title="Verified booking attribution" description="Booking outcomes are linked to confirmed booking records; revenue is separately gated by financial reconciliation.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Confirmed attributed bookings" value={ops?.conversion.verified_attributed_bookings} />
          <Stat label="Leads in period" value={ops?.leads.total} />
          <Stat label="Consent-verified leads" value={ops?.leads.consent_verified} />
          <Stat label="Bookings with currency mismatch" value={ops?.conversion.booking_currency_mismatch_count} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Lead-to-booking rate unavailable: {ops?.conversion.lead_to_booking_rate_reason ?? "relationship evidence is loading."}
          {" "}Revenue unavailable: {ops?.conversion.revenue_reason ?? "financial evidence is loading."}
        </p>
      </SectionCard>

      <SectionCard title="Guest feedback" description="Recorded guest sentiment; not a factual-accuracy evaluation.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Feedback responses" value={ops?.feedback.total} />
          <Stat label="Helpful" value={ops?.feedback.helpful} />
          <Stat label="Not helpful" value={ops?.feedback.not_helpful} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Satisfaction rate: {ops?.feedback.satisfaction_rate == null ? "—" : pct(ops.feedback.satisfaction_rate)}
          {" "}· Factual accuracy remains unavailable without human-labelled evaluations.
        </p>
      </SectionCard>

      <SectionCard title="Campaign attribution funnel" description="Event-level funnel counts and UTM source breakdown for the selected property and period.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Page views" value={ops?.campaign.funnel.page_view} />
          <Stat label="Booking clicks" value={ops?.campaign.funnel.booking_click} />
          <Stat label="Booking starts" value={ops?.campaign.funnel.booking_started} />
          <Stat label="Lead submissions" value={ops?.campaign.funnel.lead_submitted} />
          <Stat label="Booking completed events" value={ops?.campaign.funnel.booking_completed} />
        </div>
        {(ops?.campaign.source_breakdown ?? []).length > 0 && (
          <ul className="mt-3 divide-y text-sm">
            {ops?.campaign.source_breakdown.map((row) => (
              <li key={row.source} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{row.source}</span>
                <span className="font-medium tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{ops?.campaign.limitation ?? "Campaign attribution is loading."}</p>
      </SectionCard>

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

