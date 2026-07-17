import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function chat(system: string, user: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Mtoni AI is not configured (missing LOVABLE_API_KEY).");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up in workspace settings.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

function tryJson<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { /* ignore */ }
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch { /* ignore */ } }
  const start = s.indexOf("{"); const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(s.slice(start, end + 1)) as T; } catch { /* ignore */ } }
  return null;
}

function today() { return new Date().toISOString().slice(0, 10); }
function daysFromNow(days: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

/** List upcoming arrivals (default: today → +14 days). */
export const listUpcomingArrivals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number } | undefined) => ({ days: Math.min(60, Math.max(1, input?.days ?? 14)) }))
  .handler(async ({ data, context }) => {
    const from = today();
    const to = daysFromNow(data.days);
    const { data: rows, error } = await context.supabase
      .from("bookings")
      .select("id, reference, guest_id, guest_name, guest_email, country, check_in, check_out, nights, adults, children, room_id, status, payment_status, balance_due, total, currency, guest_type, special_requests")
      .gte("check_in", from)
      .lte("check_in", to)
      .in("status", ["confirmed", "checked_in"])
      .order("check_in");
    if (error) throw error;
    return rows ?? [];
  });

async function loadBookingContext(supabase: any, bookingId: string) {
  const { data: booking, error } = await supabase
    .from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw error;
  if (!booking) throw new Error("Booking not found.");
  const guestId = booking.guest_id as string | null;

  const [guestRes, prefsRes, notesRes, historyRes, roomRes, tagsRes] = await Promise.all([
    guestId ? supabase.from("guests").select("*").eq("id", guestId).maybeSingle() : Promise.resolve({ data: null }),
    guestId ? supabase.from("guest_preferences").select("category,key,value").eq("guest_id", guestId) : Promise.resolve({ data: [] }),
    guestId ? supabase.from("guest_notes").select("body,created_at").eq("guest_id", guestId).eq("is_deleted", false).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    guestId ? supabase.from("bookings").select("id,reference,check_in,check_out,total,currency,status").eq("guest_id", guestId).neq("id", bookingId).order("check_in", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    booking.room_id ? supabase.from("rooms").select("id,name,slug,short_description").eq("id", booking.room_id).maybeSingle() : Promise.resolve({ data: null }),
    guestId ? supabase.from("guest_tag_assignments").select("guest_tags(name,color)").eq("guest_id", guestId) : Promise.resolve({ data: [] }),
  ]);

  return {
    booking,
    guest: guestRes.data,
    preferences: prefsRes.data ?? [],
    notes: notesRes.data ?? [],
    history: historyRes.data ?? [],
    room: roomRes.data,
    tags: (tagsRes.data ?? []).map((t: any) => t.guest_tags).filter(Boolean),
  };
}

/** Deterministic guest health score (0–100). */
function computeHealthScore(input: {
  historyCount: number;
  lifetimeSpend: number;
  cancellationCount: number;
  vip: boolean;
  hasBalance: boolean;
}) {
  const dims = [
    { key: "repeat_visits",   weight: 25, value: Math.min(1, input.historyCount / 5),           note: `${input.historyCount} previous stay(s)` },
    { key: "lifetime_spend",  weight: 25, value: Math.min(1, input.lifetimeSpend / 5000),        note: `Lifetime spend ~${input.lifetimeSpend}` },
    { key: "vip_status",      weight: 15, value: input.vip ? 1 : 0,                              note: input.vip ? "VIP guest" : "Not VIP" },
    { key: "payment_health",  weight: 20, value: input.hasBalance ? 0.3 : 1,                     note: input.hasBalance ? "Outstanding balance" : "Paid in full" },
    { key: "reliability",     weight: 15, value: Math.max(0, 1 - input.cancellationCount * 0.3), note: `${input.cancellationCount} cancellation(s)` },
  ];
  const score = Math.round(dims.reduce((s, d) => s + d.weight * d.value, 0));
  const tier = score >= 80 ? "platinum" : score >= 60 ? "gold" : score >= 40 ? "silver" : "bronze";
  return { score, tier, dimensions: dims };
}

function detectAlerts(ctx: Awaited<ReturnType<typeof loadBookingContext>>) {
  const alerts: Array<{ kind: string; severity: "info" | "warning" | "critical"; title: string; detail: string }> = [];
  const b = ctx.booking;
  const g = ctx.guest;
  const start = new Date(b.check_in);
  const end = new Date(b.check_out);
  const inRange = (d?: string | null) => {
    if (!d) return false;
    // birthday/anniversary are MM-DD ideally, but stored as date; check month/day within stay
    const dt = new Date(d);
    const m = dt.getUTCMonth(); const day = dt.getUTCDate();
    for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
      if (cur.getUTCMonth() === m && cur.getUTCDate() === day) return true;
    }
    return false;
  };
  if (g?.birthday && inRange(g.birthday)) alerts.push({ kind: "birthday", severity: "info", title: "Birthday during stay", detail: `${g.full_name}'s birthday falls within their stay.` });
  if (g?.anniversary && inRange(g.anniversary)) alerts.push({ kind: "anniversary", severity: "info", title: "Anniversary during stay", detail: `${g.full_name}'s anniversary falls within their stay.` });
  if (ctx.preferences.length === 0) alerts.push({ kind: "missing_preferences", severity: "info", title: "No recorded preferences", detail: "Consider capturing preferences on arrival." });
  if (g?.vip_since) alerts.push({ kind: "high_value_guest", severity: "warning", title: "VIP arriving", detail: `VIP since ${new Date(g.vip_since).toISOString().slice(0,10)}.` });
  if (Number(b.balance_due ?? 0) > 0) alerts.push({ kind: "outstanding_balance", severity: "warning", title: "Outstanding balance", detail: `${b.currency} ${b.balance_due} still due.` });
  if ((ctx.history?.length ?? 0) > 0) alerts.push({ kind: "repeat_guest", severity: "info", title: "Repeat guest", detail: `${ctx.history.length} previous stay(s).` });
  if ((b.nights ?? 0) >= 7) alerts.push({ kind: "long_stay", severity: "info", title: "Long stay", detail: `${b.nights} nights.` });
  const specials = String(b.special_requests ?? "").toLowerCase();
  if (specials.includes("airport") || specials.includes("transfer")) {
    alerts.push({ kind: "unconfirmed_transfer", severity: "warning", title: "Airport transfer mentioned", detail: "Verify transfer is confirmed." });
  }
  return alerts;
}

/** Generate AI briefing for a booking. Returns briefing + prep recommendations + health + alerts. */
export const generateGuestBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string; persist?: boolean }) => {
    const bookingId = String(input?.bookingId ?? "");
    if (!bookingId) throw new Error("bookingId is required.");
    return { bookingId, persist: input?.persist ?? true };
  })
  .handler(async ({ data, context }) => {
    const start = Date.now();
    const ctx = await loadBookingContext(context.supabase, data.bookingId);
    const lifetimeSpend = (ctx.history ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);
    const cancellationCount = (ctx.history ?? []).filter((r: any) => r.status === "cancelled").length;
    const health = computeHealthScore({
      historyCount: ctx.history.length,
      lifetimeSpend,
      cancellationCount,
      vip: Boolean(ctx.guest?.vip_since),
      hasBalance: Number(ctx.booking.balance_due ?? 0) > 0,
    });

    const summaryFacts = {
      guest: ctx.guest ? {
        full_name: ctx.guest.full_name, nationality: ctx.guest.nationality ?? ctx.guest.country,
        language: ctx.guest.preferred_language, vip: !!ctx.guest.vip_since,
        birthday: ctx.guest.birthday, anniversary: ctx.guest.anniversary,
      } : { full_name: ctx.booking.guest_name, nationality: ctx.booking.country },
      stay: {
        check_in: ctx.booking.check_in, check_out: ctx.booking.check_out,
        nights: ctx.booking.nights, adults: ctx.booking.adults, children: ctx.booking.children,
        room: ctx.room?.name, reference: ctx.booking.reference,
        special_requests: ctx.booking.special_requests,
      },
      preferences: ctx.preferences,
      notes: ctx.notes.map((n: any) => n.body),
      history_count: ctx.history.length,
      lifetime_spend: lifetimeSpend,
      tags: ctx.tags.map((t: any) => t.name),
    };

    const system = [
      "You are Mtoni AI generating a guest arrival briefing for the front-desk team.",
      "Return strict JSON:",
      '{"summary": string, "prep": [{"title": string, "reasoning": string, "confidence": number, "category": string}]}',
      "prep = 2-5 concrete preparation actions. Each MUST have a reasoning that cites the facts. Never invent details not in the facts. Confidence is 0-1.",
    ].join("\n");
    const userMsg = `Guest facts (JSON):\n${JSON.stringify(summaryFacts).slice(0, 6000)}`;
    const raw = await chat(system, userMsg);
    const parsed = tryJson<{ summary: string; prep: Array<{ title: string; reasoning: string; confidence: number; category?: string }> }>(raw)
      ?? { summary: raw.trim() || "Briefing unavailable.", prep: [] };

    const alerts = detectAlerts(ctx);

    // Persist recommendations + alerts (best-effort)
    if (data.persist) {
      if (parsed.prep?.length) {
        await context.supabase.from("ai_guest_recommendations").insert(
          parsed.prep.map((p) => ({
            booking_id: ctx.booking.id,
            guest_id: ctx.guest?.id ?? null,
            kind: "prep",
            title: p.title,
            body: null,
            reasoning: p.reasoning,
            confidence: Math.max(0, Math.min(1, Number(p.confidence ?? 0.6))),
            category: p.category ?? "prep",
            evidence: [{ domain: "guests", note: "briefing" }] as never,
            model: MODEL,
          })),
        );
      }
      if (alerts.length) {
        await context.supabase.from("ai_guest_alerts").upsert(
          alerts.map((a) => ({
            booking_id: ctx.booking.id, guest_id: ctx.guest?.id ?? null,
            kind: a.kind, severity: a.severity, title: a.title, detail: a.detail,
            evidence: [{ note: "auto-detected" }] as never,
          })),
          { onConflict: "id" },
        );
      }
      await context.supabase.from("ai_activity_logs").insert({
        user_id: context.userId,
        question: `Briefing for booking ${ctx.booking.reference}`,
        domains_accessed: ["guests", "reservations"],
        tool_called: "guest.briefing",
        response: parsed.summary,
        model: MODEL,
        status: "completed",
        duration_ms: Date.now() - start,
      });
    }

    return { summary: parsed.summary, prep: parsed.prep ?? [], health, alerts, context: ctx };
  });

/** Generate opportunity recommendations (experiences, transfers, dining, etc.). */
export const generateOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string; persist?: boolean }) => {
    const bookingId = String(input?.bookingId ?? "");
    if (!bookingId) throw new Error("bookingId is required.");
    return { bookingId, persist: input?.persist ?? true };
  })
  .handler(async ({ data, context }) => {
    const start = Date.now();
    const ctx = await loadBookingContext(context.supabase, data.bookingId);
    const facts = {
      stay_length: ctx.booking.nights,
      adults: ctx.booking.adults, children: ctx.booking.children,
      month: new Date(ctx.booking.check_in).getUTCMonth() + 1,
      country: ctx.booking.country,
      guest_type: ctx.booking.guest_type,
      preferences: ctx.preferences,
      history_count: ctx.history.length,
      lifetime_spend: (ctx.history ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0),
      special_requests: ctx.booking.special_requests,
    };
    const system = [
      "You are Mtoni AI recommending upsell opportunities for a booking at Mtoni River Lodge (Moshi, Tanzania).",
      "Only recommend from this catalog: airport_transfer, romantic_dinner, picnic, spa_treatment, kilimanjaro_day_hike, maasai_village_tour, coffee_farm_tour, guided_forest_walk.",
      "Return strict JSON:",
      '{"opportunities": [{"title": string, "category": string, "reasoning": string, "confidence": number, "expected_value_usd": number}]}',
      "Each opportunity MUST cite facts in reasoning. Confidence 0-1. Do NOT recommend automatic booking.",
    ].join("\n");
    const raw = await chat(system, `Facts: ${JSON.stringify(facts).slice(0, 4000)}`);
    const parsed = tryJson<{ opportunities: Array<{ title: string; category: string; reasoning: string; confidence: number; expected_value_usd: number }> }>(raw)
      ?? { opportunities: [] };

    if (data.persist && parsed.opportunities?.length) {
      await context.supabase.from("ai_guest_recommendations").insert(
        parsed.opportunities.map((o) => ({
          booking_id: ctx.booking.id, guest_id: ctx.guest?.id ?? null,
          kind: "opportunity",
          title: o.title,
          reasoning: o.reasoning,
          confidence: Math.max(0, Math.min(1, Number(o.confidence ?? 0.5))),
          expected_value: Number(o.expected_value_usd ?? 0) || null,
          category: o.category ?? "experience",
          evidence: [{ domain: "guests", note: "opportunity" }] as never,
          model: MODEL,
        })),
      );
      await context.supabase.from("ai_activity_logs").insert({
        user_id: context.userId,
        question: `Opportunities for booking ${ctx.booking.reference}`,
        domains_accessed: ["guests", "marketing"],
        tool_called: "guest.opportunities",
        response: `Generated ${parsed.opportunities.length} opportunities.`,
        model: MODEL,
        status: "completed",
        duration_ms: Date.now() - start,
      });
    }

    return { opportunities: parsed.opportunities ?? [] };
  });

/** Recommendation actions. */
export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId?: string } | undefined) => ({ bookingId: input?.bookingId ?? null }))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("ai_guest_recommendations")
      .select("*").order("created_at", { ascending: false }).limit(100);
    if (data.bookingId) q = q.eq("booking_id", data.bookingId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const actionRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "accept" | "dismiss" | "convert" }) => {
    if (!input?.id) throw new Error("id required");
    if (!["accept", "dismiss", "convert"].includes(input?.action)) throw new Error("bad action");
    return { id: input.id, action: input.action };
  })
  .handler(async ({ data, context }) => {
    const status = data.action === "accept" ? "accepted" : data.action === "dismiss" ? "dismissed" : "converted";
    let taskId: string | null = null;
    if (data.action === "convert") {
      const { data: rec } = await context.supabase.from("ai_guest_recommendations").select("*").eq("id", data.id).maybeSingle();
      if (rec) {
        const { data: task } = await context.supabase.from("ops_tasks").insert({
          booking_id: rec.booking_id, task_type: "ai_recommendation",
          title: rec.title, description: rec.reasoning,
          priority: 2,
        }).select("id").maybeSingle();
        taskId = task?.id ?? null;
      }
    }
    const { error } = await context.supabase.from("ai_guest_recommendations")
      .update({ status, actioned_by: context.userId, actioned_at: new Date().toISOString(), action_task_id: taskId ?? undefined })
      .eq("id", data.id);
    if (error) throw error;
    await context.supabase.from("ai_activity_logs").insert({
      user_id: context.userId,
      question: `Recommendation ${data.id} ${data.action}`,
      domains_accessed: ["guests"],
      tool_called: "guest.recommendation.action",
      response: `Marked ${status}`,
      model: MODEL,
      status: "completed",
      duration_ms: 0,
    });
    return { ok: true, status, taskId };
  });

/** Alerts list & actions. */
export const listGuestAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("ai_guest_alerts")
      .select("*").eq("status", "open").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const actionGuestAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "dismiss" | "convert" }) => {
    if (!input?.id) throw new Error("id required");
    return { id: input.id, action: input.action };
  })
  .handler(async ({ data, context }) => {
    if (data.action === "dismiss") {
      const { error } = await context.supabase.from("ai_guest_alerts")
        .update({ status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: context.userId })
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true };
    }
    const { data: alert } = await context.supabase.from("ai_guest_alerts").select("*").eq("id", data.id).maybeSingle();
    if (!alert) throw new Error("Alert not found");
    const { data: task } = await context.supabase.from("ops_tasks").insert({
      booking_id: alert.booking_id, task_type: "ai_alert",
      title: alert.title, description: alert.detail,
      priority: alert.severity === "critical" ? 1 : 2,
    }).select("id").maybeSingle();
    await context.supabase.from("ai_guest_alerts")
      .update({ status: "converted", task_id: task?.id ?? null }).eq("id", data.id);
    return { ok: true, taskId: task?.id };
  });

/** Daily dashboard aggregate. */
export const getGuestDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = today();
    const soon = daysFromNow(14);
    const [arrivalsRes, alertsRes, recsRes] = await Promise.all([
      context.supabase.from("bookings")
        .select("id, reference, guest_id, guest_name, check_in, check_out, room_id, balance_due, guest_type, special_requests, currency")
        .gte("check_in", t).lte("check_in", soon)
        .in("status", ["confirmed", "checked_in"])
        .order("check_in"),
      context.supabase.from("ai_guest_alerts").select("*").eq("status", "open").order("created_at", { ascending: false }),
      context.supabase.from("ai_guest_recommendations").select("*").eq("status", "pending").eq("kind", "opportunity").order("created_at", { ascending: false }).limit(20),
    ]);
    const arrivals = arrivalsRes.data ?? [];
    const alerts = alertsRes.data ?? [];
    const todayArrivals = arrivals.filter((a) => a.check_in === t);
    return {
      today: t,
      todayArrivals,
      upcomingArrivals: arrivals,
      vipArrivals: arrivals.filter((a) => a.guest_type === "vip"),
      outstandingBalances: arrivals.filter((a) => Number(a.balance_due ?? 0) > 0),
      specialRequests: arrivals.filter((a) => (a.special_requests ?? "").length > 0),
      birthdays: alerts.filter((a) => a.kind === "birthday"),
      anniversaries: alerts.filter((a) => a.kind === "anniversary"),
      repeatGuests: alerts.filter((a) => a.kind === "repeat_guest"),
      opportunities: recsRes.data ?? [],
      openAlerts: alerts,
    };
  });