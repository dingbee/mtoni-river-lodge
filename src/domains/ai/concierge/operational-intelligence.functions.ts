import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { percentileMinutes, responseIntervals } from "./operational-intelligence.metrics";

type Window = "7d" | "30d" | "90d";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseWindow(value: unknown): Window {
  return value === "7d" || value === "90d" ? value : "30d";
}


async function fetchAllRows(buildQuery: () => any): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function activeProperty(sb: any, userId: string): Promise<string> {
  const { data: propertyId, error } = await sb.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("No active property selected.");
  const { data: membership, error: membershipError } = await sb
    .from("staynas_property_members")
    .select("property_id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .in("role", ["owner", "manager", "admin", "reservations", "reception", "marketing"])
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Forbidden");
  return String(propertyId);
}

function responseIntervals(rows: any[]) {
  const unique = new Map<string, any>();
  for (const row of rows) {
    const key = row.provider_message_id
      ? `provider:${row.property_id}:${row.channel}:${row.provider}:${row.provider_message_id}`
      : row.client_message_id
        ? `client:${row.property_id}:${row.session_id}:${row.client_message_id}`
        : `row:${row.id}`;
    if (!unique.has(key)) unique.set(key, row);
  }

  const bySession = new Map<string, any[]>();
  for (const row of unique.values()) {
    const bucket = bySession.get(row.session_id) ?? [];
    bucket.push(row);
    bySession.set(row.session_id, bucket);
  }

  const first: number[] = [];
  const ai: number[] = [];
  const human: number[] = [];
  let unanswered = 0;
  for (const messages of bySession.values()) {
    messages.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || String(a.id).localeCompare(String(b.id)));
    const pending: number[] = [];
    let firstInboundAt: number | null = null;
    let firstAnswered = false;
    for (const message of messages) {
      const at = Date.parse(message.occurred_at);
      if (!Number.isFinite(at) || ["event", "template"].includes(message.message_type)) continue;
      if (message.direction === "outbound" && !["recorded", "delivered", "read"].includes(message.status)) continue;
      if (message.direction === "inbound" && message.actor_type === "guest") {
        pending.push(at);
        if (firstInboundAt === null) firstInboundAt = at;
      } else if (message.direction === "outbound" && ["assistant", "staff"].includes(message.actor_type) && pending.length) {
        const inboundAt = pending.shift()!;
        const interval = at - inboundAt;
        if (interval < 0) continue;
        (message.actor_type === "assistant" ? ai : human).push(interval);
        if (!firstAnswered && firstInboundAt !== null) {
          first.push(at - firstInboundAt);
          firstAnswered = true;
        }
      }
    }
    if (pending.length) unanswered += 1;
  }
  return { first, ai, human, unanswered, conversations: bySession.size };
}

/** Tenant-scoped operational, escalation, knowledge and conversion evidence. */
export const getConciergeOperationalIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { window?: Window } | undefined) => ({ window: parseWindow(input?.window) }))
  .handler(async ({ data, context }) => {
    const propertyId = await activeProperty(context.supabase, context.userId);
    const sb = context.supabase as any;
    const days = data.window === "7d" ? 7 : data.window === "90d" ? 90 : 30;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 86_400_000);
    const since = periodStart.toISOString();

    const [property, sessions, messageRows, legacyMessages, feedbackRows, leadRows, escalationRows, activeSlaRows, documentRows, chunkRows, searchRows, conciergeAttributionRows, campaignAttributionRows, slaEventRows, slaAlertRows, slaPolicyRows] = await Promise.all([
      sb.from("staynas_properties").select("id,timezone").eq("id", propertyId).maybeSingle(),
      sb.from("ai_concierge_sessions").select("id", { count: "exact", head: true }).eq("property_id", propertyId).gte("created_at", since),
      fetchAllRows(() => sb.from("ai_omnichannel_messages")
        .select("id,property_id,session_id,channel,direction,actor_type,message_type,status,provider,provider_message_id,client_message_id,occurred_at")
        .eq("property_id", propertyId).gte("occurred_at", since).order("occurred_at", { ascending: true })),
      fetchAllRows(() => sb.from("ai_concierge_messages")
        .select("id,session_id,role,citations,created_at,ai_concierge_sessions!inner(property_id)")
        .eq("ai_concierge_sessions.property_id", propertyId).eq("role", "assistant").gte("created_at", since)),
      fetchAllRows(() => sb.from("ai_concierge_feedback")
        .select("id,session_id,message_id,rating,created_at,ai_concierge_sessions!inner(property_id)")
        .eq("ai_concierge_sessions.property_id", propertyId).gte("created_at", since)),
      fetchAllRows(() => sb.from("ai_concierge_leads").select("id,status,consent_at,consent_version,created_at").eq("property_id", propertyId).gte("created_at", since)),
      fetchAllRows(() => sb.from("ai_escalations")
        .select("id,session_id,property_id,status,priority,assigned_to,created_at,acknowledged_at,resolved_at,assignment_due_at,acknowledgement_due_at,resolution_due_at,reopened_at,sla_cycle_started_at")
        .eq("property_id", propertyId).gte("created_at", since)),
      fetchAllRows(() => sb.from("ai_escalations")
        .select("id,status,assigned_to,acknowledged_at,assignment_due_at,acknowledgement_due_at,resolution_due_at")
        .eq("property_id", propertyId).in("status",["open","assigned","acknowledged","in_progress"])),
      fetchAllRows(() => sb.from("knowledge_documents").select("id,status,current_version,source_updated_at,review_due_at").eq("property_id", propertyId)),
      fetchAllRows(() => sb.from("knowledge_chunks").select("id,document_id,version").eq("property_id", propertyId)),
      fetchAllRows(() => sb.from("ai_knowledge_search_log").select("id,result_count,matched_source_ids,created_at").eq("property_id", propertyId).gte("created_at", since)),
      fetchAllRows(() => sb.from("ai_concierge_attributions")
        .select("id,booking_id,conversion_type,created_at,ai_concierge_sessions!inner(property_id)")
        .eq("ai_concierge_sessions.property_id", propertyId).gte("created_at", since)),
      fetchAllRows(() => sb.from("campaign_attribution").select("id,booking_id,event_type,source,medium,utm_campaign,occurred_at")
        .eq("property_id", propertyId).gte("occurred_at", since)),
      fetchAllRows(() => sb.from("ai_escalation_events").select("id,escalation_id,event_type,metadata,occurred_at")
        .eq("property_id", propertyId).gte("occurred_at", since)),
      fetchAllRows(() => sb.from("ai_escalation_sla_alerts").select("id,escalation_id,milestone,alert_type,due_at,created_at")
        .eq("property_id", propertyId).gte("created_at", since)),
      fetchAllRows(() => sb.from("ai_escalation_sla_policies").select("id,priority,enabled").eq("property_id", propertyId)),
    ]);

    for (const result of [property, sessions]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (!property.data) throw new Error("Active property configuration is unavailable.");

    const response = responseIntervals(messageRows);
    const escalationCreatedAt = new Map(escalationRows.map((row: any) => [row.id, row.created_at]));
    const acknowledgedIntervals = slaEventRows.flatMap((event: any) => {
      if (event.event_type !== "acknowledged") return [];
      const startedAt = event.metadata?.sla_cycle_started_at ?? escalationCreatedAt.get(event.escalation_id);
      if (!startedAt) return [];
      const interval = Date.parse(event.occurred_at) - Date.parse(startedAt);
      return Number.isFinite(interval) && interval >= 0 ? [interval] : [];
    });
    const resolvedIntervals = slaEventRows.flatMap((event: any) => {
      if (event.event_type !== "resolved") return [];
      const startedAt = event.metadata?.sla_cycle_started_at ?? escalationCreatedAt.get(event.escalation_id);
      if (!startedAt) return [];
      const interval = Date.parse(event.occurred_at) - Date.parse(startedAt);
      return Number.isFinite(interval) && interval >= 0 ? [interval] : [];
    });
    const consentVerifiedLeads = leadRows.filter((row: any) => row.consent_at && row.consent_version).length;
    const leadStatusCounts = Object.fromEntries(["new", "contacted", "qualified", "converted", "closed"].map((status) => [
      status, leadRows.filter((row: any) => row.status === status).length,
    ]));
    const escalationStatusCounts = Object.fromEntries(["open", "assigned", "acknowledged", "in_progress", "resolved", "dismissed"].map((status) => [
      status, escalationRows.filter((row: any) => row.status === status).length,
    ]));

    const bookingIds = new Set<string>();
    for (const row of conciergeAttributionRows) {
      if (row.booking_id && ["assisted_booking", "direct_booking"].includes(row.conversion_type)) bookingIds.add(String(row.booking_id));
    }
    for (const row of campaignAttributionRows) {
      if (row.booking_id && row.event_type === "booking_completed") bookingIds.add(String(row.booking_id));
    }
    const verifiedBookings: any[] = [];
    const bookingIdList = [...bookingIds];
    for (let offset = 0; offset < bookingIdList.length; offset += 200) {
      const { data: bookingRows, error } = await sb.from("bookings")
        .select("id,status,confirmed_at,cancelled_at")
        .eq("property_id", propertyId).in("id", bookingIdList.slice(offset, offset + 200));
      if (error) throw new Error(error.message);
      verifiedBookings.push(...(bookingRows ?? []).filter((row: any) =>
        row.confirmed_at && !row.cancelled_at && ["confirmed", "checked_in", "completed"].includes(String(row.status)),
      ));
    }
    const confirmedBookingCount = new Set(verifiedBookings.map((row: any) => row.id)).size;
    const closedInWindow = new Set(slaEventRows.filter((event: any) => ["resolved","dismissed"].includes(event.event_type)).map((event: any) => event.escalation_id));
    const reopenedInWindow = new Set(slaEventRows.filter((event: any) => event.event_type === "reopened").map((event: any) => event.escalation_id));
    const reopenedAfterWindowClosure = [...reopenedInWindow].filter((id) => closedInWindow.has(id)).length;
    const slaCompletionEvents = slaEventRows.flatMap((event: any) => {
      const milestone = event.event_type === "assigned" ? "assignment" : event.event_type === "acknowledged" ? "acknowledgement" : event.event_type === "resolved" ? "resolution" : null;
      const dueAt = milestone ? event.metadata?.[milestone === "assignment" ? "assignment_due_at" : milestone === "acknowledgement" ? "acknowledgement_due_at" : "resolution_due_at"] : null;
      if (!milestone || !dueAt) return [];
      return [{ milestone, met: Date.parse(event.occurred_at) <= Date.parse(dueAt) }];
    });
    const slaByMilestone = Object.fromEntries(["assignment","acknowledgement","resolution"].map((milestone) => {
      const completed = slaCompletionEvents.filter((event: any) => event.milestone === milestone);
      const met = completed.filter((event: any) => event.met).length;
      return [milestone, { completed: completed.length, met, breached: completed.length - met, compliance_rate: completed.length ? round(met / completed.length, 4) : null }];
    }));
    const activeSlaOverdue = activeSlaRows.reduce((count: number, row: any) => {
      if (["resolved","dismissed"].includes(row.status)) return count;
      const now = Date.now();
      return count + Number((!row.assigned_to && row.assignment_due_at && Date.parse(row.assignment_due_at) < now)
        || (!row.acknowledged_at && row.acknowledgement_due_at && Date.parse(row.acknowledgement_due_at) < now)
        || (row.resolution_due_at && Date.parse(row.resolution_due_at) < now));
    }, 0);
    const campaignEventCounts = Object.fromEntries(["page_view", "booking_click", "booking_started", "lead_submitted", "booking_completed"].map((eventType) => [
      eventType, campaignAttributionRows.filter((row: any) => row.event_type === eventType).length,
    ]));
    const assistantRows = legacyMessages;
    const citedAnswers = assistantRows.filter((row: any) => Array.isArray(row.citations) && row.citations.length > 0).length;
    const citationCount = assistantRows.reduce((sum: number, row: any) => sum + (Array.isArray(row.citations) ? row.citations.length : 0), 0);
    const helpfulFeedback = feedbackRows.filter((row: any) => row.rating === "helpful").length;
    const notHelpfulFeedback = feedbackRows.filter((row: any) => row.rating === "not_helpful").length;
    const campaignSources = new Map<string, number>();
    for (const event of campaignAttributionRows) {
      const key = [event.source ?? "unknown", event.medium ?? "unknown", event.utm_campaign ?? "unlabelled"].join(" / ");
      campaignSources.set(key, (campaignSources.get(key) ?? 0) + 1);
    }
    const currentChunkCount = chunkRows.filter((chunk: any) =>
      documentRows.some((doc: any) => doc.id === chunk.document_id && doc.current_version === chunk.version && doc.status === "published"),
    ).length;

    return {
      period_start: since,
      period_end: periodEnd.toISOString(),
      timezone: property.data.timezone ?? "UTC",
      generated_at: new Date().toISOString(),
      source_status: "queried",
      operations: {
        sessions: sessions.count ?? 0,
        omnichannel_messages: messageRows.length,
        first_response_minutes: { p50: percentileMinutes(response.first, 0.5), p90: percentileMinutes(response.first, 0.9), sample_size: response.first.length },
        ai_response_minutes: { p50: percentileMinutes(response.ai, 0.5), p90: percentileMinutes(response.ai, 0.9), sample_size: response.ai.length },
        human_response_minutes: { p50: percentileMinutes(response.human, 0.5), p90: percentileMinutes(response.human, 0.9), sample_size: response.human.length },
        unanswered_conversations: response.unanswered,
        response_metric_note: "Pairs eligible guest inbound messages with the next assistant/staff outbound message; excludes event/template messages, outbound messages not recorded/delivered/read, and duplicate provider/client message identifiers.",
      },
      leads: { total: leadRows.length, consent_verified: consentVerifiedLeads, consent_unverified: leadRows.length - consentVerifiedLeads, by_status: leadStatusCounts, qualified: leadStatusCounts.qualified, consent_evidence_available: true },
      feedback: {
        total: feedbackRows.length,
        helpful: helpfulFeedback,
        not_helpful: notHelpfulFeedback,
        satisfaction_rate: feedbackRows.length ? round(helpfulFeedback / feedbackRows.length, 4) : null,
        factual_accuracy_available: false,
      },
      campaign: {
        events: campaignAttributionRows.length,
        funnel: campaignEventCounts,
        source_breakdown: [...campaignSources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 20),
        identity_stitching_available: false,
        limitation: "Campaign session keys are not joined to a verified cross-channel guest identity; source breakdown is event-level and not unique-visitor attribution.",
      },
      conversion: {
        verified_attributed_bookings: confirmedBookingCount,
        lead_to_booking_rate: null,
        lead_to_booking_rate_available: false,
        lead_to_booking_rate_reason: "No durable lead_id-to-booking_id relationship exists; an attributed booking count cannot be divided by an unrelated lead denominator.",
        revenue: null,
        revenue_available: false,
        revenue_reason: "Financial reporting is outside this sprint's scope.",
      },
      sla: {
        policy_priorities_configured: slaPolicyRows.filter((row: any) => row.enabled).length,
        lifecycle_events: slaEventRows.length,
        approaching_alerts: slaAlertRows.filter((row: any) => row.alert_type === "approaching_breach").length,
        breached_alerts: slaAlertRows.filter((row: any) => row.alert_type === "breached").length,
        active_overdue_escalations: activeSlaOverdue,
        by_milestone: slaByMilestone,
        notification_channel: "in_app",
      },
      escalations: {
        total: escalationRows.length,
        by_status: escalationStatusCounts,
        median_resolution_minutes: resolvedIntervals.length
          ? percentileMinutes(resolvedIntervals, 0.5)
          : null,
        resolution_sample_size: resolvedIntervals.length,
        median_acknowledgement_minutes: acknowledgedIntervals.length ? percentileMinutes(acknowledgedIntervals, 0.5) : null,
        acknowledgement_sample_size: acknowledgedIntervals.length,
        acknowledgement_latency_available: true,
        reopened_escalations: reopenedInWindow.size,
        closed_escalations_in_window: closedInWindow.size,
        same_window_reopen_rate: closedInWindow.size ? round(reopenedAfterWindowClosure / closedInWindow.size, 4) : null,
        same_window_reopen_rate_available: closedInWindow.size > 0,
        sla_compliance_available: true,
        limitation: "Same-window reopen rate counts distinct escalations both closed and reopened in the selected period; cross-window reopen cohorts are not included.",
      },
      knowledge: {
        documents: documentRows.length,
        published_documents: documentRows.filter((doc: any) => doc.status === "published").length,
        current_published_chunks: currentChunkCount,
        retrieval_searches: searchRows.length,
        zero_result_searches: searchRows.filter((row: any) => Number(row.result_count) === 0).length,
        assistant_answers: assistantRows.length,
        answers_with_validated_citations: citedAnswers,
        validated_citation_coverage: assistantRows.length ? round(citedAnswers / assistantRows.length, 4) : null,
        validated_citation_count: citationCount,
        citation_coverage_available: true,
        factual_accuracy_available: false,
        limitation: "Citation coverage uses citations persisted on assistant messages after runtime validation against retrieved property evidence. It is not a human-labelled factual-accuracy score. Search-log rows are property-wide knowledge searches and are not assumed to be Concierge retrievals.",
      },
      measurement: {
        attributed_confirmed_booking_count_available: true,
        lead_to_booking_rate_available: false,
        revenue_available: false,
        factual_accuracy_available: false,
      },
    };
  });
