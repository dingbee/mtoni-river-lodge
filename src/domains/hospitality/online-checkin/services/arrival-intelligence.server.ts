/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary, matching arrivals.server.ts. */
/**
 * Guest Arrival Intelligence — server logic.
 * Reuses the shared Mtoni AI Gateway transport, the existing arrivals role
 * gate, `ai_stay_insights` for storage and `ai_activity_logs` for auditing.
 * Output is advisory only and never guest-facing.
 */
import { AI_GATEWAY_DEFAULT_MODEL, callAiGateway, parseAiJson } from "@/lib/ai-gateway.server";
import { assertArrivalsAccess, deriveReadiness } from "./arrivals.server";
import type { ArrivalBriefing } from "./arrival-intelligence-shared";

type Sb = any;

const INSIGHT_TYPE = "arrival_briefing";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

async function loadContext(supabase: Sb, bookingId: string) {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, reference, guest_id, guest_name, guest_type, country, check_in, check_out, nights, adults, children, status, payment_status, balance_amount, currency, room_id, special_requests",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) throw new Error("Reservation not found.");

  const guestId = booking.guest_id as string | null;
  const [arrivalRes, docsRes, roomRes, roomStatesRes, checkinRes, prefsRes, historyRes, guestRes] =
    await Promise.all([
      supabase.from("arrival_information").select("*").eq("booking_id", bookingId).maybeSingle(),
      supabase.from("guest_documents").select("status, kind").eq("booking_id", bookingId),
      supabase.from("rooms").select("name").eq("id", booking.room_id).maybeSingle(),
      supabase.from("room_states").select("state, unit_label, booking_id, room_id").eq("room_id", booking.room_id),
      supabase.from("guest_checkins").select("status, submitted_at").eq("booking_id", bookingId).maybeSingle(),
      guestId
        ? supabase.from("guest_preferences").select("category, key, value").eq("guest_id", guestId)
        : Promise.resolve({ data: [] }),
      guestId
        ? supabase
            .from("bookings")
            .select("id, check_in, status")
            .eq("guest_id", guestId)
            .neq("id", bookingId)
            .in("status", ["checked_in", "completed"])
        : Promise.resolve({ data: [] }),
      guestId ? supabase.from("guests").select("full_name, status, vip_since, preferred_language, nationality").eq("id", guestId).maybeSingle() : Promise.resolve({ data: null }),
    ]);

  return {
    booking,
    arrival: arrivalRes.data ?? null,
    documents: (docsRes.data ?? []) as any[],
    roomName: roomRes.data?.name ?? null,
    roomStates: (roomStatesRes.data ?? []) as any[],
    checkin: checkinRes.data ?? null,
    preferences: (prefsRes.data ?? []) as any[],
    previousStays: (historyRes.data ?? []).length,
    guest: guestRes.data ?? null,
  };
}

function buildFacts(ctx: Awaited<ReturnType<typeof loadContext>>) {
  const docs = ctx.documents;
  const assigned = ctx.roomStates.find((r) => r.booking_id === ctx.booking.id);
  const documentStatus =
    docs.length === 0
      ? "none"
      : docs.some((d) => d.status === "rejected")
        ? "rejected"
        : docs.every((d) => d.status === "verified")
          ? "verified"
          : "pending";
  const roomReadiness =
    assigned?.state ??
    (ctx.roomStates.some((r) => r.state === "vacant_clean") ? "vacant_clean" : "not_ready");

  const readiness = deriveReadiness({
    checkinStatus: (ctx.checkin?.status ?? "no_link") as any,
    documentStatus: documentStatus as any,
    roomReadiness,
    reservationStatus: ctx.booking.status,
    transferRequired: ctx.arrival?.transfer_required ?? null,
    specialRequests: ctx.arrival?.special_requests ?? ctx.booking.special_requests ?? null,
    alerts: [],
  });

  return {
    readiness,
    documentStatus,
    roomReadiness,
    facts: {
      reference: ctx.booking.reference,
      guest_name: ctx.booking.guest_name,
      guest_type: ctx.booking.guest_type,
      guest_status: ctx.guest?.status ?? null,
      vip: Boolean(ctx.guest?.vip_since),
      language: ctx.guest?.preferred_language ?? null,
      nationality: ctx.guest?.nationality ?? ctx.booking.country ?? null,
      stay: {
        check_in: ctx.booking.check_in,
        check_out: ctx.booking.check_out,
        nights: ctx.booking.nights,
        adults: ctx.booking.adults,
        children: ctx.booking.children,
        room: ctx.roomName,
        unit: assigned?.unit_label ?? null,
        reservation_status: ctx.booking.status,
        payment_status: ctx.booking.payment_status,
        balance: Number(ctx.booking.balance_amount ?? 0),
        currency: ctx.booking.currency,
      },
      arrival: ctx.arrival
        ? {
            estimated_arrival_time: ctx.arrival.estimated_arrival_time,
            arrival_mode: ctx.arrival.arrival_mode,
            flight_number: ctx.arrival.flight_number,
            transfer_required: ctx.arrival.transfer_required,
            dietary_requirements: ctx.arrival.dietary_requirements,
            accessibility_needs: ctx.arrival.accessibility_needs,
            visit_purpose: ctx.arrival.visit_purpose,
            special_requests: ctx.arrival.special_requests,
          }
        : null,
      preferences: ctx.preferences.map((p) => `${p.category}:${p.key}=${p.value}`),
      previous_stays: ctx.previousStays,
      documents: { count: ctx.documents.length, status: documentStatus },
      room_readiness: roomReadiness,
      outstanding_actions: readiness.outstandingActions,
    },
  };
}

function fallbackBriefing(built: ReturnType<typeof buildFacts>, bookingId: string): ArrivalBriefing {
  const f = built.facts as any;
  const lines: string[] = [];
  lines.push(`Guest arriving ${f.stay.check_in} for ${f.stay.nights} night(s) in ${f.stay.room ?? "room TBA"}.`);
  if (f.arrival?.transfer_required) lines.push("Airport transfer requested.");
  if (f.arrival?.dietary_requirements) lines.push(`Dietary: ${f.arrival.dietary_requirements}.`);
  if (f.previous_stays > 0) lines.push(`Returning guest (${f.previous_stays} previous stay(s)).`);
  if (f.vip || f.guest_type === "vip") lines.push("VIP guest — special attention required.");
  return {
    bookingId,
    summary: lines.join(" "),
    highlights: [
      f.arrival?.estimated_arrival_time ? `ETA ${f.arrival.estimated_arrival_time}` : null,
      f.stay.unit ? `Unit ${f.stay.unit}` : null,
      f.previous_stays > 0 ? "Returning guest" : "First stay",
    ].filter(Boolean) as string[],
    attention: built.readiness.outstandingActions,
    source: "fallback",
    generatedAt: new Date().toISOString(),
    model: null,
  };
}

export async function getArrivalBriefing(
  supabase: Sb,
  userId: string,
  input: { bookingId: string; refresh?: boolean },
): Promise<ArrivalBriefing> {
  await assertArrivalsAccess(supabase, userId);

  if (!input.refresh) {
    const { data: cached } = await supabase
      .from("ai_stay_insights")
      .select("content, evidence, updated_at")
      .eq("booking_id", input.bookingId)
      .eq("insight_type", INSIGHT_TYPE)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached && Date.now() - Date.parse(cached.updated_at) < MAX_AGE_MS) {
      const ev = (cached.evidence ?? {}) as any;
      return {
        bookingId: input.bookingId,
        summary: cached.content,
        highlights: Array.isArray(ev.highlights) ? ev.highlights : [],
        attention: Array.isArray(ev.attention) ? ev.attention : [],
        source: "cached",
        generatedAt: cached.updated_at,
        model: ev.model ?? null,
      };
    }
  }

  const ctx = await loadContext(supabase, input.bookingId);
  const built = buildFacts(ctx);

  let briefing: ArrivalBriefing;
  let error: string | null = null;
  const started = Date.now();
  try {
    const system = [
      "You are Mtoni AI producing a concise operational arrival briefing for lodge front-desk and operations staff.",
      "Use ONLY the supplied facts — never invent guest details.",
      "Be factual, discreet and operational. Do not include payment card, passport or document numbers.",
      'Return strict JSON: {"summary": string, "highlights": string[], "attention": string[]}',
      "summary: 2-4 short sentences. highlights: up to 4 short phrases. attention: outstanding operational actions.",
    ].join("\n");
    const { content, model } = await callAiGateway({
      system,
      user: `Arrival facts (JSON):\n${JSON.stringify(built.facts).slice(0, 6000)}`,
      jsonMode: true,
    });
    const parsed = parseAiJson<{ summary: string; highlights?: string[]; attention?: string[] }>(content);
    if (!parsed?.summary) throw new Error("AI returned no summary");
    briefing = {
      bookingId: input.bookingId,
      summary: parsed.summary,
      highlights: (parsed.highlights ?? []).slice(0, 6),
      attention: (parsed.attention ?? built.readiness.outstandingActions).slice(0, 8),
      source: "ai",
      generatedAt: new Date().toISOString(),
      model: model ?? AI_GATEWAY_DEFAULT_MODEL,
    };
  } catch (err) {
    error = (err as Error).message;
    briefing = fallbackBriefing(built, input.bookingId);
  }

  // Persist (advisory insight) — replace the previous briefing for this booking.
  try {
    await supabase
      .from("ai_stay_insights")
      .delete()
      .eq("booking_id", input.bookingId)
      .eq("insight_type", INSIGHT_TYPE);
    await supabase.from("ai_stay_insights").insert({
      booking_id: input.bookingId,
      insight_type: INSIGHT_TYPE,
      content: briefing.summary,
      status: "active",
      confidence: briefing.source === "ai" ? 0.7 : 0.4,
      evidence: {
        highlights: briefing.highlights,
        attention: briefing.attention,
        readiness: built.readiness.readiness,
        model: briefing.model,
      },
    });
  } catch (err) {
    console.warn("[arrival-intelligence] persist failed", (err as Error).message);
  }

  // Audit (existing AI audit trail).
  try {
    await supabase.from("ai_activity_logs").insert({
      user_id: userId,
      question: `Arrival briefing for booking ${ctx.booking.reference}`,
      domains_accessed: ["guests", "reservations", "operations"],
      tool_called: "arrivals.briefing",
      response: briefing.summary,
      module: "online-checkin",
      model: briefing.model,
      latency_ms: Date.now() - started,
      success: !error,
      error,
    });
  } catch (err) {
    console.warn("[arrival-intelligence] audit failed", (err as Error).message);
  }

  return briefing;
}

/** Automation + arrival timeline for one booking (existing activity logs). */
export async function getArrivalTimeline(supabase: Sb, userId: string, bookingId: string) {
  await assertArrivalsAccess(supabase, userId);
  const [checkinRes, automationRes] = await Promise.all([
    supabase
      .from("guest_checkin_activity")
      .select("id, action, created_at, detail")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("activity_logs")
      .select("id, action, created_at, metadata, actor_email")
      .eq("entity_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const entries = [
    ...((checkinRes.data ?? []) as any[]).map((a) => ({
      id: `c-${a.id}`,
      at: a.created_at,
      action: a.action,
      source: a.action.startsWith("automation_") ? "automation" : "guest",
      actor: null as string | null,
    })),
    ...((automationRes.data ?? []) as any[]).map((a) => ({
      id: `a-${a.id}`,
      at: a.created_at,
      action: a.action,
      source: String(a.action).startsWith("arrival.automation.") ? "automation" : "staff",
      actor: a.actor_email ?? null,
    })),
  ].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));

  return entries.slice(0, 80);
}
