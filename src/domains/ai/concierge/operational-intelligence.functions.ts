import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Window = "7d" | "30d" | "90d";

function parseWindow(value: unknown): Window {
  return value === "7d" || value === "90d" ? value : "30d";
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower) / 60_000);
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
    .in("role", ["owner", "manager", "admin", "reception", "marketing"])
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Forbidden");
  return String(propertyId);
}

function responseIntervals(rows: any[]) {
  const unique = new Map<string, any>();
  for (const row of rows) {
    const key = row.provider_message_id
      ? `provider:${row.property_id}:${row.provider}:${row.provider_message_id}`
      : row.client_message_id
        ? `client:${row.property_id}:${row.client_message_id}`
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
      if (!Number.isFinite(at) || ["event", "template"].includes(message.message_type) || ["failed", "undeliverable"].includes(message.status)) continue;
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

    const [property, sessions, messages, leads, escalations, docs, chunks, searches, conciergeAttributions, campaignAttributions] = await Promise.all([
      sb.from("staynas_properties").select("id,currency,timezone").eq("id", propertyId).maybeSingle(),
      sb.from("ai_concierge_sessions").select("id,created_at").eq("property_id", propertyId).gte("created_at", since),
      sb.from("ai_omnichannel_messages")
        .select("id,property_id,session_id,direction,actor_type,message_type,status,provider,provider_message_id,client_message_id,occurred_at")
        .eq("property_id", propertyId).gte("occurred_at", since).order("occurred_at", { ascending: true }).limit(10000),
      sb.from("ai_concierge_leads").select("id,status,created_at").eq("property_id", propertyId).gte("created_at", since),
      sb.from("ai_escalations")
        .select("id,session_id,status,priority,assigned_to,created_at,resolved_at,ai_concierge_sessions!inner(property_id)")
        .eq("ai_concierge_sessions.property_id", propertyId).gte("created_at", since),
      sb.from("knowledge_documents").select("id,status,current_version,source_updated_at,review_due_at").eq("property_id", propertyId),
      sb.from("knowledge_chunks").select("id,document_id,version").eq("property_id", propertyId),
      sb.from("ai_knowledge_search_log").select("id,result_count,matched_source_ids,created_at").eq("property_id", propertyId).gte("created_at", since),
      sb.from("ai_concierge_attributions")
        .select("id,booking_id,conversion_type,created_at,ai_concierge_sessions!inner(property_id)")
        .eq("ai_concierge_sessions.property_id", propertyId).gte("created_at", since),
      sb.from("campaign_attribution").select("id,booking_id,event_type,occurred_at")
        .eq("property_id", propertyId).eq("event_type", "booking_completed").gte("occurred_at", since),
    ]);

    for (const result of [property, sessions, messages, leads, escalations, docs, chunks, searches, conciergeAttributions, campaignAttributions]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (!property.data) throw new Error("Active property configuration is unavailable.");

    const messageRows = messages.data ?? [];
    const response = responseIntervals(messageRows);
    const escalationRows = escalations.data ?? [];
    const resolvedIntervals = escalationRows
      .filter((row: any) => row.resolved_at && row.status === "resolved")
      .map((row: any) => Date.parse(row.resolved_at) - Date.parse(row.created_at))
      .filter((value: number) => Number.isFinite(value) && value >= 0);
    const leadRows = leads.data ?? [];
    const leadStatusCounts = Object.fromEntries(["new", "contacted", "qualified", "converted", "closed"].map((status) => [
      status, leadRows.filter((row: any) => row.status === status).length,
    ]));
    const escalationStatusCounts = Object.fromEntries(["open", "assigned", "in_progress", "resolved", "dismissed"].map((status) => [
      status, escalationRows.filter((row: any) => row.status === status).length,
    ]));

    const bookingIds = new Set<string>();
    for (const row of [...(conciergeAttributions.data ?? []), ...(campaignAttributions.data ?? [])]) {
      if (row.booking_id) bookingIds.add(String(row.booking_id));
    }
    let verifiedBookings: any[] = [];
    if (bookingIds.size) {
      const { data: bookingRows, error } = await sb.from("bookings")
        .select("id,status,confirmed_at,cancelled_at,currency,total")
        .eq("property_id", propertyId).in("id", [...bookingIds]);
      if (error) throw new Error(error.message);
      verifiedBookings = (bookingRows ?? []).filter((row: any) =>
        row.confirmed_at && !row.cancelled_at && ["confirmed", "checked_in", "completed"].includes(String(row.status)),
      );
    }
    const confirmedBookingCount = new Set(verifiedBookings.map((row: any) => row.id)).size;
    const { count: currencyMismatchCount, error: currencyError } = await sb.from("bookings")
      .select("id", { count: "exact", head: true }).eq("property_id", propertyId)
      .neq("currency", property.data.currency);
    if (currencyError) throw new Error(currencyError.message);

    const documentRows = docs.data ?? [];
    const currentChunkCount = (chunks.data ?? []).filter((chunk: any) =>
      documentRows.some((doc: any) => doc.id === chunk.document_id && doc.current_version === chunk.version && doc.status === "published"),
    ).length;
    const searchRows = searches.data ?? [];

    return {
      period_start: since,
      period_end: periodEnd.toISOString(),
      timezone: property.data.timezone ?? "UTC",
      currency: property.data.currency ?? null,
      generated_at: new Date().toISOString(),
      source_status: "queried",
      operations: {
        sessions: sessions.data?.length ?? 0,
        omnichannel_messages: messageRows.length,
        first_response_minutes: { p50: percentile(response.first, 0.5), p90: percentile(response.first, 0.9), sample_size: response.first.length },
        ai_response_minutes: { p50: percentile(response.ai, 0.5), p90: percentile(response.ai, 0.9), sample_size: response.ai.length },
        human_response_minutes: { p50: percentile(response.human, 0.5), p90: percentile(response.human, 0.9), sample_size: response.human.length },
        unanswered_conversations: response.unanswered,
        response_metric_note: "Pairs eligible guest inbound messages with the next assistant/staff outbound message; excludes event/template messages, failed or undeliverable outbound messages, and duplicate provider/client message identifiers.",
      },
      leads: { total: leadRows.length, by_status: leadStatusCounts, qualified: leadStatusCounts.qualified },
      conversion: {
        verified_attributed_bookings: confirmedBookingCount,
        eligible_leads: eligibleLeads,
        lead_to_booking_rate: null,
        lead_to_booking_rate_available: false,
        lead_to_booking_rate_reason: "No durable lead_id-to-booking_id relationship exists; an attributed booking count cannot be divided by an unrelated lead denominator.",
        revenue: null,
        revenue_available: false,
        revenue_reason: "Realized revenue requires reconciled, verified payment and reversal ledger evidence; booking totals and paid flags are not treated as settlement proof.",
        booking_currency_mismatch_count: currencyMismatchCount ?? 0,
      },
      escalations: {
        total: escalationRows.length,
        by_status: escalationStatusCounts,
        median_resolution_minutes: resolvedIntervals.length
          ? percentile(resolvedIntervals, 0.5)
          : null,
        resolution_sample_size: resolvedIntervals.length,
        acknowledgement_latency_available: false,
        reopen_rate_available: false,
        sla_compliance_available: false,
        limitation: "The current escalation schema has no acknowledged_at timestamp, immutable status/reassignment/reopen history, or versioned SLA policy snapshot.",
      },
      knowledge: {
        documents: documentRows.length,
        published_documents: documentRows.filter((doc: any) => doc.status === "published").length,
        current_published_chunks: currentChunkCount,
        retrieval_searches: searchRows.length,
        zero_result_searches: searchRows.filter((row: any) => Number(row.result_count) === 0).length,
        answer_grounding_rate_available: false,
        limitation: "Search logs do not persist a verified session/message/answer foreign-key trace; retrieval counts cannot establish answer grounding or factual accuracy.",
      },
      measurement: {
        attributed_confirmed_booking_count_available: true,
        lead_to_booking_rate_available: false,
        revenue_available: false,
        factual_accuracy_available: false,
      },
    };
  });
