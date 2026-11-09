import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFounderAiAdmin } from "@/domains/ai/ai.authorization.server";

async function requirePropertyScope(
  sb: any,
  userId: string,
  roles: string[] = ["owner", "manager", "admin", "reception", "marketing"],
): Promise<string> {
  const { data: propertyId, error: contextError } = await sb.rpc("staynas_active_property_id", { _uid: userId });
  if (contextError || !propertyId) throw new Error("No active property selected.");
  const { data: membership, error: membershipError } = await sb
    .from("staynas_property_members")
    .select("property_id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .in("role", roles)
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Forbidden");
  return String(propertyId);
}

async function propertySessionIds(sb: any, propertyId: string, since?: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = sb.from("ai_concierge_sessions").select("id").eq("property_id", propertyId);
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((row: { id: string }) => row.id);
    ids.push(...page);
    if (page.length < pageSize) break;
  }
  return ids;
}

type Window = "7d" | "30d" | "90d";

function sinceDays(w: Window): string {
  const days = w === "7d" ? 7 : w === "90d" ? 90 : 30;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function parseWindow(v: unknown): Window {
  return v === "7d" || v === "90d" ? v : "30d";
}

/** Aggregate KPIs for the analytics dashboard. */
export const getConciergeAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { window?: Window } | undefined) => ({ window: parseWindow(input?.window) }))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const since = sinceDays(data.window);
    const s = context.supabase;
    const sessionIds = await propertySessionIds(s, propertyId, since);

    const zero = { count: 0, data: [], error: null };
    const [
      messages,
      escalations,
      leads,
      intentsHigh,
      attrClicks,
      attrBookings,
      feedbackHelpful,
      feedbackNot,
      avgConfRow,
    ] = await Promise.all([
      sessionIds.length ? s.from("ai_concierge_messages").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since) : Promise.resolve(zero),
      sessionIds.length ? s.from("ai_concierge_sessions").select("id", { count: "exact", head: true }).in("id", sessionIds).eq("escalated", true) : Promise.resolve(zero),
      s.from("ai_concierge_leads").select("id", { count: "exact", head: true }).eq("property_id", propertyId).gte("created_at", since),
      sessionIds.length ? s.from("ai_concierge_intents").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since).eq("intent_level", "high") : Promise.resolve(zero),
      sessionIds.length ? s.from("ai_concierge_attributions").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since).eq("conversion_type", "booking_click") : Promise.resolve(zero),
      sessionIds.length ? s.from("ai_concierge_attributions").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since).in("conversion_type", ["assisted_booking", "direct_booking"]) : Promise.resolve(zero),
      sessionIds.length ? s.from("ai_concierge_feedback").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since).eq("rating", "helpful") : Promise.resolve(zero),
      sessionIds.length ? s.from("ai_concierge_feedback").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since).eq("rating", "not_helpful") : Promise.resolve(zero),
      sessionIds.length ? s.from("ai_concierge_messages").select("confidence").in("session_id", sessionIds).gte("created_at", since).not("confidence", "is", null).limit(2000) : Promise.resolve(zero),
    ]);
    for (const result of [messages, escalations, leads, intentsHigh, attrClicks, attrBookings, feedbackHelpful, feedbackNot, avgConfRow]) {
      if (result.error) throw new Error(result.error.message);
    }

    const sessionsCount = sessionIds.length;
    const messagesCount = messages.count ?? 0;
    const escalationsCount = escalations.count ?? 0;
    const leadsCount = leads.count ?? 0;
    const intentHighCount = intentsHigh.count ?? 0;
    const bookingClicks = attrClicks.count ?? 0;
    const assistedBookings = attrBookings.count ?? 0;
    const helpful = feedbackHelpful.count ?? 0;
    const notHelpful = feedbackNot.count ?? 0;

    const confRows = (avgConfRow.data ?? []) as Array<{ confidence: number | null }>;
    const avgConfidence = confRows.length
      ? confRows.reduce((a, r) => a + (Number(r.confidence) || 0), 0) / confRows.length
      : 0;

    const avgMessagesPerSession = sessionsCount ? messagesCount / sessionsCount : 0;
    const conversionRate = sessionsCount ? bookingClicks / sessionsCount : 0;
    const escalationRate = sessionsCount ? escalationsCount / sessionsCount : 0;
    const feedbackTotal = helpful + notHelpful;
    const satisfaction = feedbackTotal ? helpful / feedbackTotal : 0;

    // Health score components (0-1)
    const accuracy = clamp01(avgConfidence * 0.7 + (1 - escalationRate) * 0.3);
    const engagement = clamp01(
      Math.min(1, avgMessagesPerSession / 6) * 0.6 + Math.min(1, sessionsCount / 100) * 0.4,
    );
    const conversion = clamp01(conversionRate * 3);
    const experience = clamp01(satisfaction || 0.7);
    const overall = (accuracy + engagement + conversion + experience) / 4;

    return {
      window: data.window,
      overview: {
        sessions: sessionsCount,
        messages: messagesCount,
        avg_messages_per_session: round(avgMessagesPerSession, 2),
        avg_confidence: round(avgConfidence, 3),
        escalation_rate: round(escalationRate, 3),
      },
      conversion: {
        booking_intents: intentHighCount,
        booking_clicks: bookingClicks,
        leads: leadsCount,
        assisted_bookings: assistedBookings,
        conversion_rate: round(conversionRate, 3),
      },
      feedback: { helpful, not_helpful: notHelpful, satisfaction: round(satisfaction, 3) },
      health: {
        accuracy: round(accuracy, 3),
        engagement: round(engagement, 3),
        conversion: round(conversion, 3),
        experience: round(experience, 3),
        overall: round(overall, 3),
      },
    };
  });

/** Journey timeline for a session (messages, intents, lead, attributions, feedback). */
export const getConciergeJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { session_id: string }) => {
    if (!input?.session_id) throw new Error("session_id required");
    return { session_id: input.session_id };
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const s = context.supabase;
    const { data: sessionRow, error: sessionError } = await s
      .from("ai_concierge_sessions")
      .select("id, property_id, channel, locale, page_context, guest_id, guest_name, guest_email, guest_phone, message_count, escalated, identity_confidence, last_active_at, created_at")
      .eq("id", data.session_id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (sessionError || !sessionRow) throw new Error("Session not found in the active property.");
    const [session, messages, intents, lead, attributions, feedback, outcomes] = await Promise.all([
      Promise.resolve({ data: sessionRow, error: null }),
      s.from("ai_concierge_messages").select("id, role, content, confidence, escalated, created_at").eq("session_id", data.session_id).order("created_at", { ascending: true }),
      s.from("ai_concierge_intents").select("id, intent_level, confidence, keywords, created_at").eq("session_id", data.session_id).order("created_at", { ascending: true }),
      s.from("ai_concierge_leads").select("id, name, email, intent_level, created_at").eq("session_id", data.session_id).maybeSingle(),
      s.from("ai_concierge_attributions").select("id, conversion_type, booking_id, metadata, created_at").eq("session_id", data.session_id).order("created_at", { ascending: true }),
      s.from("ai_concierge_feedback").select("id, rating, comment, created_at").eq("session_id", data.session_id).order("created_at", { ascending: true }),
      s.from("ai_concierge_outcomes").select("id, outcome_type, confidence, evidence, created_at").eq("session_id", data.session_id).order("created_at", { ascending: true }),
    ]);

    type Event = { at: string; type: string; label: string; detail?: string };
    const events: Event[] = [];
    if (session.data) events.push({ at: session.data.created_at, type: "opened", label: "Opened Concierge" });
    for (const m of messages.data ?? []) {
      events.push({
        at: m.created_at,
        type: m.role === "user" ? "message_user" : "message_ai",
        label: m.role === "user" ? "Guest message" : "AI reply",
        detail: (m.content ?? "").slice(0, 160),
      });
    }
    for (const i of intents.data ?? []) {
      events.push({ at: i.created_at, type: `intent_${i.intent_level}`, label: `Booking intent · ${i.intent_level}` });
    }
    if (lead.data) events.push({ at: lead.data.created_at, type: "lead", label: `Lead captured (${lead.data.intent_level})` });
    for (const a of attributions.data ?? []) {
      events.push({ at: a.created_at, type: a.conversion_type, label: a.conversion_type.replaceAll("_", " ") });
    }
    for (const f of feedback.data ?? []) {
      events.push({ at: f.created_at, type: `feedback_${f.rating}`, label: `Feedback · ${f.rating}`, detail: f.comment ?? undefined });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));

    return { session: session.data, events, outcomes: outcomes.data ?? [] };
  });

/** Classify outcomes for recent sessions (writes to ai_concierge_outcomes). Idempotent by session. */
export const classifyConciergeOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { window?: Window } | undefined) => ({ window: parseWindow(input?.window) }))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, ["owner", "manager", "admin", "marketing"]);
    const since = sinceDays(data.window);
    const s = context.supabase;

    const { data: sessions, error: sessionsError } = await s
      .from("ai_concierge_sessions")
      .select("id, escalated, created_at")
      .eq("property_id", propertyId)
      .gte("created_at", since)
      .limit(500);
    if (sessionsError) throw new Error(sessionsError.message);

    if (!sessions?.length) return { classified: 0 };

    const ids = sessions.map((r) => r.id);
    const [existing, intents, leads, atts, msgs] = await Promise.all([
      s.from("ai_concierge_outcomes").select("session_id").in("session_id", ids),
      s.from("ai_concierge_intents").select("session_id, intent_level").in("session_id", ids),
      s.from("ai_concierge_leads").select("session_id").in("session_id", ids),
      s.from("ai_concierge_attributions").select("session_id, conversion_type").in("session_id", ids),
      s.from("ai_concierge_messages").select("session_id, role, content").in("session_id", ids),
    ]);
    for (const result of [existing, intents, leads, atts, msgs]) {
      if (result.error) throw new Error(result.error.message);
    }
    for (const result of [existing, intents, leads, atts, msgs]) {
      if (result.error) throw new Error(result.error.message);
    }

    const done = new Set((existing.data ?? []).map((r: any) => r.session_id));
    const intentBySession = new Map<string, string>();
    for (const r of intents.data ?? []) intentBySession.set(r.session_id as string, r.intent_level as string);
    const leadIds = new Set((leads.data ?? []).map((r: any) => r.session_id));
    const attrBySession = new Map<string, string>();
    for (const r of atts.data ?? []) attrBySession.set(r.session_id as string, r.conversion_type as string);
    const msgsBySession = new Map<string, Array<{ role: string; content: string }>>();
    for (const m of msgs.data ?? []) {
      const arr = msgsBySession.get(m.session_id as string) ?? [];
      arr.push({ role: m.role as string, content: (m.content as string) ?? "" });
      msgsBySession.set(m.session_id as string, arr);
    }

    const inserts: Array<{
      session_id: string;
      outcome_type: string;
      confidence: number;
      evidence: any;
    }> = [];
    for (const sess of sessions) {
      if (done.has(sess.id)) continue;
      const attr = attrBySession.get(sess.id);
      const intent = intentBySession.get(sess.id);
      const hasLead = leadIds.has(sess.id);
      const escalated = sess.escalated;
      const sessionMsgs = msgsBySession.get(sess.id) ?? [];
      const userText = sessionMsgs.filter((m) => m.role === "user").map((m) => m.content).join(" ").toLowerCase();

      let outcome = "information_request";
      let confidence = 0.6;
      const evidence: Record<string, any> = {};

      if (attr === "assisted_booking" || attr === "direct_booking") {
        outcome = "converted"; confidence = 0.95; evidence.attribution = attr;
      } else if (hasLead) {
        outcome = "lead_captured"; confidence = 0.9;
      } else if (intent === "high" || attr === "booking_click") {
        outcome = "booking_intent"; confidence = 0.85; evidence.intent = intent ?? null;
      } else if (escalated) {
        outcome = "escalated"; confidence = 0.9;
      } else if (/experience|safari|kilimanjaro|tour/i.test(userText)) {
        outcome = "experience_enquiry"; confidence = 0.7;
      } else if (/room|suite|bed|price|rate/i.test(userText)) {
        outcome = "room_enquiry"; confidence = 0.7;
      } else if (sessionMsgs.filter((m) => m.role === "user").length <= 1) {
        outcome = "abandoned"; confidence = 0.55;
      }

      inserts.push({ session_id: sess.id, outcome_type: outcome, confidence, evidence });
    }

    if (inserts.length) {
      const { error } = await s.from("ai_concierge_outcomes").insert(inserts);
      if (error) throw new Error(error.message);
    }
    return { classified: inserts.length };
  });

/** Outcome distribution for the analytics dashboard. */
export const getConciergeOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { window?: Window } | undefined) => ({ window: parseWindow(input?.window) }))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const since = sinceDays(data.window);
    const sessionIds = await propertySessionIds(context.supabase, propertyId, since);
    if (sessionIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("ai_concierge_outcomes")
      .select("outcome_type")
      .in("session_id", sessionIds)
      .gte("created_at", since)
      .limit(5000);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of rows ?? []) counts.set(r.outcome_type as string, (counts.get(r.outcome_type as string) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([outcome_type, count]) => ({ outcome_type, count }))
      .sort((a, b) => b.count - a.count);
  });

/** Knowledge gap surface: repeated low-confidence assistant replies. */
export const getKnowledgeGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { window?: Window } | undefined) => ({ window: parseWindow(input?.window) }))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const since = sinceDays(data.window);
    const sessionIds = await propertySessionIds(context.supabase, propertyId, since);
    if (sessionIds.length === 0) return [];
    const { data: rows, error } = await context.supabase
      .from("ai_concierge_messages")
      .select("session_id, content, confidence, escalated, role, created_at")
      .in("session_id", sessionIds)
      .gte("created_at", since)
      .eq("role", "assistant")
      .or("confidence.lt.0.5,escalated.eq.true")
      .limit(500);
    if (error) throw new Error(error.message);

    // Group by rough content topic (first 60 chars, normalised)
    const groups = new Map<string, { key: string; count: number; sample: string; escalated: number; avg_conf: number; confs: number[] }>();
    for (const r of rows ?? []) {
      const key = String(r.content ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
      if (!key) continue;
      const g = groups.get(key) ?? { key, count: 0, sample: r.content as string, escalated: 0, avg_conf: 0, confs: [] };
      g.count += 1;
      if (r.escalated) g.escalated += 1;
      if (r.confidence != null) g.confs.push(Number(r.confidence));
      groups.set(key, g);
    }
    return Array.from(groups.values())
      .map((g) => ({
        key: g.key,
        occurrences: g.count,
        escalations: g.escalated,
        avg_confidence: g.confs.length ? round(g.confs.reduce((a, b) => a + b, 0) / g.confs.length, 3) : null,
        sample: g.sample.slice(0, 240),
      }))
      .filter((g) => g.occurrences >= 2)
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 25);
  });

/** Insights list + status updates for the improvement loop. */
export const listConciergeInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ai_concierge_insights")
      .select("id, topic, category, question_count, escalation_count, sample_questions, impact_score, status, recommended_action, evidence, bucket_date, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateConciergeInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status?: string; recommended_action?: string | null }) => {
    if (!input?.id) throw new Error("id required");
    if (input.status && !["new", "reviewed", "accepted", "dismissed", "converted"].includes(input.status)) {
      throw new Error("invalid status");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const patch: { status?: string; recommended_action?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (data.status) patch.status = data.status;
    if (typeof data.recommended_action !== "undefined") patch.recommended_action = data.recommended_action;
    const { error } = await context.supabase.from("ai_concierge_insights").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function round(v: number, d = 2) { const f = 10 ** d; return Math.round(v * f) / f; }