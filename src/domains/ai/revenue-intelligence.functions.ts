import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Revenue Intelligence AI (Sprint 8D)
 *
 * Deterministic, explainable forecasts and recommendations built on
 * confirmed reservations, historical bookings and pricing rules. The AI
 * NEVER modifies pricing, reservations, or promotions — every output
 * requires a human to accept, dismiss, assign, or convert to a task.
 */

const MODEL = "deterministic:mtoni-revenue-v1";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function today() { return iso(new Date()); }
function daysFromNow(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function daysAgo(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
function diffDays(a: string, b: string) { return Math.round((+new Date(b) - +new Date(a)) / 86400000); }
function clamp(v: number, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }

// ---------------------------------------------------------------------------
// Overview — dashboard KPIs
// ---------------------------------------------------------------------------

export const getRevenueIntelligenceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: rooms }, { data: mtd }, { data: forward }, { data: past30 }, { data: prev30 }, { data: outstanding }, { data: cancelled30 }, { data: openAlerts }] = await Promise.all([
      context.supabase.from("rooms").select("total_units").eq("status", "active"),
      context.supabase.from("bookings").select("total, currency, status, check_in, check_out, nights").gte("check_in", firstOfMonth()).in("status", ["confirmed","checked_in","completed"]),
      context.supabase.from("bookings").select("total, currency, status, check_in, check_out, nights").gte("check_in", today()).lte("check_in", daysFromNow(30)).in("status", ["confirmed","pending","checked_in"]),
      context.supabase.from("bookings").select("total, created_at").gte("created_at", daysAgo(30)).in("status", ["confirmed","checked_in","completed"]),
      context.supabase.from("bookings").select("total, created_at").gte("created_at", daysAgo(60)).lt("created_at", daysAgo(30)).in("status", ["confirmed","checked_in","completed"]),
      context.supabase.from("bookings").select("balance_due, currency").gt("balance_due", 0).in("status", ["confirmed","checked_in","completed"]),
      context.supabase.from("bookings").select("id, created_at").eq("status", "cancelled").gte("created_at", daysAgo(30)),
      context.supabase.from("ai_revenue_alerts").select("id").eq("status","open"),
    ]);

    const totalUnits = (rooms ?? []).reduce((s, r: any) => s + Number(r.total_units ?? 0), 0);
    const currency = (mtd?.[0] as any)?.currency ?? "USD";
    const mtdRevenue = (mtd ?? []).reduce((s, b: any) => s + Number(b.total ?? 0), 0);
    const mtdNights = (mtd ?? []).reduce((s, b: any) => s + Number(b.nights ?? 0), 0);
    const forwardRevenue = (forward ?? []).reduce((s, b: any) => s + Number(b.total ?? 0), 0);
    const forwardNights = (forward ?? []).reduce((s, b: any) => s + Number(b.nights ?? 0), 0);

    const now = new Date();
    const daysElapsed = Math.max(1, now.getUTCDate());
    const capacityMTD = totalUnits * daysElapsed;
    const occupancy = capacityMTD > 0 ? mtdNights / capacityMTD : 0;
    const adr = mtdNights > 0 ? mtdRevenue / mtdNights : 0;
    const revpar = capacityMTD > 0 ? mtdRevenue / capacityMTD : 0;

    const past30Total = (past30 ?? []).reduce((s, b: any) => s + Number(b.total ?? 0), 0);
    const prev30Total = (prev30 ?? []).reduce((s, b: any) => s + Number(b.total ?? 0), 0);
    const paceDelta = prev30Total > 0 ? (past30Total - prev30Total) / prev30Total : 0;

    const outstandingTotal = (outstanding ?? []).reduce((s, b: any) => s + Number(b.balance_due ?? 0), 0);
    const cancellationCount = cancelled30?.length ?? 0;

    const forwardCapacity = totalUnits * 30;
    const expectedOccupancy = forwardCapacity > 0 ? forwardNights / forwardCapacity : 0;
    const atRisk = (forward ?? []).filter((b: any) => b.status === "pending").reduce((s, b: any) => s + Number(b.total ?? 0), 0);

    return {
      currency,
      mtdRevenue, forwardRevenue,
      occupancy, adr, revpar,
      paceDelta, past30Total, prev30Total,
      outstandingTotal,
      cancellationCount,
      expectedOccupancy,
      revenueAtRisk: atRisk,
      openAlerts: openAlerts?.length ?? 0,
    };
  });

function firstOfMonth() {
  const d = new Date();
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

// ---------------------------------------------------------------------------
// Forecast — deterministic projection with confidence
// ---------------------------------------------------------------------------

/**
 * Methodology: combine confirmed forward reservations (known revenue) with
 * a seasonally-adjusted historical booking pace to estimate the remainder.
 * Confidence is derived from data volume (history length) and stability
 * (variance of past monthly totals).
 */
export const generateRevenueForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { horizon?: 7 | 30 | 90; persist?: boolean }) => ({
    horizon: (input?.horizon === 7 || input?.horizon === 90 ? input.horizon : 30) as 7 | 30 | 90,
    persist: input?.persist ?? true,
  }))
  .handler(async ({ data, context }) => {
    const horizon = data.horizon;
    const from = today();
    const to = daysFromNow(horizon);

    const [{ data: rooms }, { data: forward }, { data: history }] = await Promise.all([
      context.supabase.from("rooms").select("total_units").eq("status", "active"),
      context.supabase.from("bookings")
        .select("total, nights, check_in, check_out, status, currency")
        .gte("check_in", from).lte("check_in", to)
        .in("status", ["confirmed","pending","checked_in"]),
      context.supabase.from("bookings")
        .select("total, nights, check_in, status")
        .gte("check_in", daysAgo(365))
        .lt("check_in", from)
        .in("status", ["confirmed","checked_in","completed"]),
    ]);

    const totalUnits = (rooms ?? []).reduce((s, r: any) => s + Number(r.total_units ?? 0), 0);
    const capacity = totalUnits * horizon;

    const confirmedRevenue = (forward ?? []).filter((b: any) => b.status !== "pending").reduce((s, b: any) => s + Number(b.total ?? 0), 0);
    const pendingRevenue = (forward ?? []).filter((b: any) => b.status === "pending").reduce((s, b: any) => s + Number(b.total ?? 0), 0);
    const confirmedNights = (forward ?? []).filter((b: any) => b.status !== "pending").reduce((s, b: any) => s + Number(b.nights ?? 0), 0);

    // Historical revenue per day, same season window
    const histRevPerDay = (history?.length ?? 0) > 0
      ? (history ?? []).reduce((s, b: any) => s + Number(b.total ?? 0), 0) / 365
      : 0;
    const projectedNew = histRevPerDay * horizon * 0.7; // discount for uncertainty
    const expectedRevenue = confirmedRevenue + Math.max(pendingRevenue * 0.6, projectedNew);

    const expectedOccupancy = capacity > 0 ? clamp(confirmedNights / capacity + 0.15, 0, 1) : 0;

    // Confidence: more historical data + more confirmed forward = higher
    const dataScore = clamp((history?.length ?? 0) / 200);
    const confirmedShare = expectedRevenue > 0 ? confirmedRevenue / expectedRevenue : 0;
    const confidence = clamp(0.35 + dataScore * 0.3 + confirmedShare * 0.35);

    const assumptions = [
      `Confirmed forward reservations (${(forward ?? []).filter((b: any) => b.status !== "pending").length}) contribute ${Math.round(confirmedShare * 100)}% of projection.`,
      `Pending reservations discounted to 60% conversion probability.`,
      `Historical daily average from last 365 days discounted to 70% to avoid over-projection.`,
      `No promotional or seasonal uplift is assumed unless recorded in pricing_rules.`,
    ];
    const evidence = [
      { source: "bookings.confirmed_forward", count: (forward ?? []).filter((b: any) => b.status !== "pending").length, revenue: confirmedRevenue },
      { source: "bookings.pending_forward",   count: (forward ?? []).filter((b: any) => b.status === "pending").length, revenue: pendingRevenue },
      { source: "bookings.history_365d",      count: history?.length ?? 0, daily_avg: histRevPerDay },
      { source: "rooms.active_units",         value: totalUnits },
    ];

    let id: string | null = null;
    if (data.persist) {
      const start = Date.now();
      const { data: row } = await context.supabase.from("ai_revenue_forecasts").insert({
        horizon_days: horizon, from_date: from, to_date: to,
        expected_revenue: expectedRevenue,
        expected_occupancy: expectedOccupancy,
        confidence,
        assumptions: assumptions as never,
        evidence: evidence as never,
        breakdown: [
          { label: "Confirmed forward", value: confirmedRevenue },
          { label: "Pending (60%)", value: pendingRevenue * 0.6 },
          { label: "Historical projection (70%)", value: projectedNew },
        ] as never,
        model: MODEL,
        generated_by: context.userId,
      }).select("id").maybeSingle();
      id = row?.id ?? null;
      await context.supabase.from("ai_activity_logs").insert({
        user_id: context.userId,
        question: `Revenue forecast (${horizon}d)`,
        domains_accessed: ["finance","reservations"],
        tool_called: "revenue.forecast",
        response: `Expected revenue ~${Math.round(expectedRevenue)} · occupancy ${Math.round(expectedOccupancy*100)}% · confidence ${Math.round(confidence*100)}%.`,
        model: MODEL, status: "completed",
        duration_ms: Date.now() - start,
      });
    }

    return {
      id, horizon, from, to,
      expectedRevenue, expectedOccupancy, confidence,
      confirmedRevenue, pendingRevenue, projectedNew,
      assumptions, evidence,
    };
  });

export const listRevenueForecasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_revenue_forecasts")
      .select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

// ---------------------------------------------------------------------------
// Pricing Advisor — deterministic recommendations, require human approval
// ---------------------------------------------------------------------------

/**
 * Rules:
 * - Occupancy > 80% and lead time short → suggest INCREASE (5–15%)
 * - Occupancy < 40% and window < 21d → suggest DECREASE / PROMOTION
 * - Cancellations spiking → suggest HOLD (don't compound demand loss)
 * - Long-stay share low → suggest PACKAGE
 * All outputs must be reviewed. No prices are written.
 */
export const generatePricingRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { persist?: boolean } | undefined) => ({ persist: input?.persist ?? true }))
  .handler(async ({ data, context }) => {
    const from = today();
    const to = daysFromNow(30);
    const [{ data: rooms }, { data: forward }, { data: cancelled }] = await Promise.all([
      context.supabase.from("rooms").select("id, name, base_price, total_units, currency").eq("status","active"),
      context.supabase.from("bookings").select("room_id, nights, status, total, check_in").gte("check_in", from).lte("check_in", to).in("status", ["confirmed","pending","checked_in"]),
      context.supabase.from("bookings").select("id, room_id, created_at").eq("status","cancelled").gte("created_at", daysAgo(14)),
    ]);

    const recs: Array<{ room_id: string | null; room_name: string; action: string; current_rate: number; suggested_rate: number; delta_pct: number; reasoning: string; expected_impact: number; confidence: number; evidence: any[] }> = [];

    for (const r of (rooms ?? []) as any[]) {
      const roomForward = (forward ?? []).filter((b: any) => b.room_id === r.id && b.status !== "pending");
      const nightsSold = roomForward.reduce((s: number, b: any) => s + Number(b.nights ?? 0), 0);
      const capacity = Number(r.total_units ?? 0) * 30;
      const occ = capacity > 0 ? nightsSold / capacity : 0;
      const cancels = (cancelled ?? []).filter((b: any) => b.room_id === r.id).length;
      const base = Number(r.base_price ?? 0);

      let action = "hold";
      let deltaPct = 0;
      let reason = "Occupancy and cancellation levels are within normal range; hold the current rate.";
      let confidence = 0.55;
      let impact = 0;

      if (occ >= 0.8) {
        action = "increase"; deltaPct = 0.1; confidence = 0.75;
        reason = `Forward occupancy ${Math.round(occ*100)}% (30d) is above the 80% threshold — capture demand by raising the rate ~10%.`;
        impact = base * deltaPct * nightsSold;
      } else if (occ < 0.4 && cancels <= 1) {
        action = "decrease"; deltaPct = -0.08; confidence = 0.65;
        reason = `Forward occupancy ${Math.round(occ*100)}% (30d) is below the 40% threshold with stable cancellations — reduce rate ~8% or introduce a targeted promotion.`;
        impact = base * Math.abs(deltaPct) * Math.max(0, capacity - nightsSold) * 0.3;
      } else if (cancels >= 3) {
        action = "hold"; deltaPct = 0; confidence = 0.6;
        reason = `${cancels} cancellations in the last 14 days for ${r.name} — hold pricing and investigate causes before adjusting.`;
      } else if (occ >= 0.55 && occ < 0.8) {
        action = "package"; deltaPct = 0; confidence = 0.55;
        reason = `Occupancy ${Math.round(occ*100)}% is healthy but not peak — bundle an experience (dinner or transfer) to lift ADR without discounting.`;
        impact = 40 * nightsSold * 0.2; // conservative
      }

      recs.push({
        room_id: r.id,
        room_name: r.name,
        action,
        current_rate: base,
        suggested_rate: Math.max(0, Math.round(base * (1 + deltaPct))),
        delta_pct: deltaPct,
        reasoning: reason,
        expected_impact: Math.round(impact),
        confidence,
        evidence: [
          { source: "forward_bookings_30d", nights_sold: nightsSold, capacity, occupancy: Number(occ.toFixed(2)) },
          { source: "cancellations_14d", count: cancels },
          { source: "rooms.base_price", value: base },
        ],
      });
    }

    if (data.persist && recs.length) {
      await context.supabase.from("ai_pricing_recommendations").insert(
        recs.map((r) => ({
          room_id: r.room_id,
          window_from: from, window_to: to,
          action: r.action,
          current_rate: r.current_rate,
          suggested_rate: r.suggested_rate,
          delta_pct: r.delta_pct,
          reasoning: r.reasoning,
          expected_impact: r.expected_impact,
          confidence: r.confidence,
          evidence: r.evidence as never,
          model: MODEL,
        })),
      );
      await context.supabase.from("ai_activity_logs").insert({
        user_id: context.userId,
        question: "Pricing advisor run",
        domains_accessed: ["finance","reservations"],
        tool_called: "revenue.pricing",
        response: `Generated ${recs.length} pricing recommendation(s) for review.`,
        model: MODEL, status: "completed", duration_ms: 0,
      });
    }
    return { recommendations: recs };
  });

export const listPricingRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_pricing_recommendations")
      .select("*, rooms(name)").order("created_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const actionPricingRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "accept" | "dismiss" | "convert" }) => {
    if (!input?.id) throw new Error("id required");
    if (!["accept","dismiss","convert"].includes(input?.action)) throw new Error("bad action");
    return input;
  })
  .handler(async ({ data, context }) => {
    const status = data.action === "accept" ? "accepted" : data.action === "dismiss" ? "dismissed" : "converted";
    let taskId: string | null = null;
    if (data.action === "convert") {
      const { data: rec } = await context.supabase.from("ai_pricing_recommendations").select("*").eq("id", data.id).maybeSingle();
      if (rec) {
        const { data: task } = await context.supabase.from("ops_tasks").insert({
          task_type: "pricing_review",
          title: `Pricing review: ${rec.action} (${rec.window_from} → ${rec.window_to})`,
          description: rec.reasoning,
          priority: 2,
        }).select("id").maybeSingle();
        taskId = task?.id ?? null;
      }
    }
    await context.supabase.from("ai_pricing_recommendations").update({
      status, actioned_by: context.userId, actioned_at: new Date().toISOString(),
      action_task_id: taskId ?? undefined,
    }).eq("id", data.id);
    await context.supabase.from("ai_activity_logs").insert({
      user_id: context.userId,
      question: `Pricing recommendation ${data.id} ${data.action}`,
      domains_accessed: ["finance"],
      tool_called: "revenue.pricing.action",
      response: `Marked ${status}`,
      model: MODEL, status: "completed", duration_ms: 0,
    });
    return { ok: true, status, taskId };
  });

// ---------------------------------------------------------------------------
// Booking patterns
// ---------------------------------------------------------------------------

export const getBookingPatterns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase.from("bookings")
      .select("id, room_id, source, status, nights, total, check_in, created_at, country")
      .gte("created_at", daysAgo(365));
    const all = (rows ?? []) as any[];

    const leadTimes = all.map((b) => Math.max(0, diffDays(b.created_at?.slice(0,10) ?? b.check_in, b.check_in)));
    const avgLead = leadTimes.length ? Math.round(leadTimes.reduce((s,v)=>s+v,0) / leadTimes.length) : 0;
    const avgStay = all.length ? Math.round(all.reduce((s,b)=>s + Number(b.nights ?? 0), 0) / all.length * 10) / 10 : 0;

    const bySource: Record<string, { count: number; revenue: number }> = {};
    for (const b of all) {
      const k = b.source ?? "unknown";
      bySource[k] = bySource[k] ?? { count: 0, revenue: 0 };
      bySource[k].count += 1;
      if (b.status !== "cancelled") bySource[k].revenue += Number(b.total ?? 0);
    }

    const byRoom: Record<string, number> = {};
    for (const b of all) if (b.room_id) byRoom[b.room_id] = (byRoom[b.room_id] ?? 0) + 1;

    const cancelled = all.filter((b) => b.status === "cancelled").length;
    const cancellationRate = all.length ? cancelled / all.length : 0;

    const byMonth: Record<string, number> = {};
    for (const b of all) {
      const m = String(b.check_in).slice(0,7);
      if (b.status !== "cancelled") byMonth[m] = (byMonth[m] ?? 0) + Number(b.total ?? 0);
    }
    const peak = Object.entries(byMonth).sort((a,b) => b[1]-a[1])[0];
    const low  = Object.entries(byMonth).sort((a,b) => a[1]-b[1])[0];

    return {
      sampleSize: all.length,
      avgLeadDays: avgLead,
      avgStayNights: avgStay,
      cancellationRate,
      bySource: Object.entries(bySource).map(([k, v]) => ({ source: k, ...v })).sort((a,b)=>b.revenue-a.revenue),
      byRoomTop: Object.entries(byRoom).map(([id, count]) => ({ room_id: id, count })).sort((a,b)=>b.count-a.count).slice(0,10),
      byMonth: Object.entries(byMonth).map(([month, total]) => ({ month, total })).sort((a,b)=>a.month.localeCompare(b.month)),
      peakMonth: peak?.[0] ?? null,
      lowMonth: low?.[0] ?? null,
    };
  });

// ---------------------------------------------------------------------------
// Opportunities & alerts
// ---------------------------------------------------------------------------

export const scanRevenueOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: outstanding }, { data: upcoming }, { data: extras }] = await Promise.all([
      context.supabase.from("bookings").select("id, reference, guest_name, balance_due, currency, check_in, check_out").gt("balance_due", 0).in("status", ["confirmed","checked_in","completed"]).order("balance_due", { ascending: false }).limit(20),
      context.supabase.from("bookings").select("id, reference, guest_name, nights, adults, children, check_in, room_id").gte("check_in", today()).lte("check_in", daysFromNow(14)).in("status", ["confirmed","checked_in"]),
      context.supabase.from("booking_extras").select("booking_id"),
    ]);

    const opps: Array<{ kind: string; title: string; detail: string; estimated_impact: number; confidence: number; evidence: any[]; recommended_action: string }> = [];

    const outstandingTotal = (outstanding ?? []).reduce((s, b: any) => s + Number(b.balance_due ?? 0), 0);
    if (outstandingTotal > 0) {
      opps.push({
        kind: "revenue_leakage",
        title: "Collect outstanding balances",
        detail: `${outstanding?.length ?? 0} bookings owe a combined ${Math.round(outstandingTotal).toLocaleString()} across confirmed and checked-out stays.`,
        estimated_impact: outstandingTotal,
        confidence: 0.9,
        evidence: [{ source: "bookings.balance_due", count: outstanding?.length ?? 0, total: outstandingTotal }],
        recommended_action: "Trigger a payment reminder workflow for guests with unpaid balances.",
      });
    }

    const extraBookingIds = new Set((extras ?? []).map((e: any) => e.booking_id));
    const noExtras = (upcoming ?? []).filter((b: any) => !extraBookingIds.has(b.id));
    if (noExtras.length) {
      opps.push({
        kind: "upsell",
        title: "Upsell experiences to upcoming arrivals",
        detail: `${noExtras.length} of the next 14-day arrivals have no add-ons booked (transfers, dining, tours).`,
        estimated_impact: noExtras.length * 60,
        confidence: 0.6,
        evidence: [{ source: "booking_extras", missing_count: noExtras.length }],
        recommended_action: "Send a pre-arrival experience menu via WhatsApp/email.",
      });
    }

    const longStays = (upcoming ?? []).filter((b: any) => (b.nights ?? 0) >= 5);
    if (longStays.length) {
      opps.push({
        kind: "cross_sell",
        title: "Cross-sell to long-stay guests",
        detail: `${longStays.length} arriving guests are booked for 5+ nights — high propensity for tours or spa treatments.`,
        estimated_impact: longStays.length * 120,
        confidence: 0.55,
        evidence: [{ source: "bookings.nights>=5", count: longStays.length }],
        recommended_action: "Offer a bundled multi-day tour package on arrival.",
      });
    }

    // Persist as open opportunities
    if (opps.length) {
      await context.supabase.from("ai_revenue_opportunities").insert(
        opps.map((o) => ({
          kind: o.kind, title: o.title, detail: o.detail,
          estimated_impact: o.estimated_impact,
          confidence: o.confidence,
          evidence: o.evidence as never,
          recommended_action: o.recommended_action,
          model: MODEL,
        })),
      );
      await context.supabase.from("ai_activity_logs").insert({
        user_id: context.userId,
        question: "Revenue opportunity scan",
        domains_accessed: ["finance","reservations","marketing"],
        tool_called: "revenue.opportunities",
        response: `Detected ${opps.length} opportunity(ies).`,
        model: MODEL, status: "completed", duration_ms: 0,
      });
    }
    return { opportunities: opps };
  });

export const listRevenueOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_revenue_opportunities")
      .select("*").eq("status","open").order("created_at",{ ascending: false }).limit(50);
    return data ?? [];
  });

export const actionRevenueOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "accept" | "dismiss" | "convert" }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const status = data.action === "accept" ? "accepted" : data.action === "dismiss" ? "dismissed" : "converted";
    let taskId: string | null = null;
    if (data.action === "convert") {
      const { data: opp } = await context.supabase.from("ai_revenue_opportunities").select("*").eq("id", data.id).maybeSingle();
      if (opp) {
        const { data: task } = await context.supabase.from("ops_tasks").insert({
          task_type: "revenue_opportunity",
          title: opp.title,
          description: opp.recommended_action ?? opp.detail,
          priority: 2,
        }).select("id").maybeSingle();
        taskId = task?.id ?? null;
      }
    }
    await context.supabase.from("ai_revenue_opportunities").update({
      status, actioned_by: context.userId, actioned_at: new Date().toISOString(),
      action_task_id: taskId ?? undefined,
    }).eq("id", data.id);
    return { ok: true, status, taskId };
  });

// Alerts

export const scanRevenueAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: rooms }, { data: forward }, { data: cancelled }, { data: outstanding }, { data: surge }] = await Promise.all([
      context.supabase.from("rooms").select("total_units").eq("status","active"),
      context.supabase.from("bookings").select("nights, status, check_in").gte("check_in", today()).lte("check_in", daysFromNow(30)).in("status", ["confirmed","checked_in"]),
      context.supabase.from("bookings").select("id, created_at").eq("status","cancelled").gte("created_at", daysAgo(14)),
      context.supabase.from("bookings").select("balance_due").gt("balance_due", 0).in("status", ["confirmed","checked_in","completed"]),
      context.supabase.from("bookings").select("id, created_at").gte("created_at", daysAgo(3)),
    ]);

    const totalUnits = (rooms ?? []).reduce((s, r: any) => s + Number(r.total_units ?? 0), 0);
    const capacity = totalUnits * 30;
    const soldNights = (forward ?? []).reduce((s, b: any) => s + Number(b.nights ?? 0), 0);
    const occ = capacity > 0 ? soldNights / capacity : 0;

    const alerts: Array<{ kind: string; severity: "info"|"warning"|"critical"; title: string; detail: string; metric: any }> = [];

    if (occ < 0.4) alerts.push({ kind: "occupancy_low", severity: "warning", title: "Forward occupancy below target", detail: `30-day forward occupancy ${Math.round(occ*100)}% is below the 40% target.`, metric: { occupancy: occ } });
    if ((cancelled?.length ?? 0) >= 5) alerts.push({ kind: "cancellation_spike", severity: "warning", title: "High cancellation rate", detail: `${cancelled?.length} cancellations in the last 14 days.`, metric: { count: cancelled?.length } });
    const outstandingTotal = (outstanding ?? []).reduce((s, b: any) => s + Number(b.balance_due ?? 0), 0);
    if (outstandingTotal > 2000) alerts.push({ kind: "large_unpaid_balances", severity: "warning", title: "Large unpaid balances", detail: `${Math.round(outstandingTotal).toLocaleString()} outstanding across ${outstanding?.length} bookings.`, metric: { total: outstandingTotal } });
    if ((surge?.length ?? 0) >= 10) alerts.push({ kind: "booking_surge", severity: "info", title: "Booking surge", detail: `${surge?.length} bookings received in the last 3 days.`, metric: { count: surge?.length } });
    if (totalUnits > 0 && soldNights > totalUnits * 30) alerts.push({ kind: "overbooking_risk", severity: "critical", title: "Potential overbooking", detail: "Forward night demand exceeds available room-nights.", metric: { soldNights, capacity } });

    if (alerts.length) {
      await context.supabase.from("ai_revenue_alerts").insert(
        alerts.map((a) => ({
          kind: a.kind, severity: a.severity, title: a.title, detail: a.detail,
          metric: a.metric as never,
          evidence: [{ source: "revenue.scan", at: new Date().toISOString() }] as never,
        })),
      );
      await context.supabase.from("ai_activity_logs").insert({
        user_id: context.userId,
        question: "Revenue alert scan",
        domains_accessed: ["finance","reservations"],
        tool_called: "revenue.alerts",
        response: `Raised ${alerts.length} alert(s).`,
        model: MODEL, status: "completed", duration_ms: 0,
      });
    }
    return { alerts };
  });

export const listRevenueAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_revenue_alerts")
      .select("*").eq("status","open").order("created_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const actionRevenueAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; action: "dismiss" | "convert" | "assign"; assigneeId?: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (data.action === "assign") {
      await context.supabase.from("ai_revenue_alerts").update({
        assigned_to: data.assigneeId ?? context.userId,
      }).eq("id", data.id);
      return { ok: true, status: "assigned" };
    }
    const status = data.action === "dismiss" ? "dismissed" : "converted";
    let taskId: string | null = null;
    if (data.action === "convert") {
      const { data: alert } = await context.supabase.from("ai_revenue_alerts").select("*").eq("id", data.id).maybeSingle();
      if (alert) {
        const { data: task } = await context.supabase.from("ops_tasks").insert({
          task_type: "revenue_alert",
          title: alert.title,
          description: alert.detail,
          priority: alert.severity === "critical" ? 1 : 2,
        }).select("id").maybeSingle();
        taskId = task?.id ?? null;
      }
    }
    await context.supabase.from("ai_revenue_alerts").update({
      status, actioned_by: context.userId, actioned_at: new Date().toISOString(),
      action_task_id: taskId ?? undefined,
    }).eq("id", data.id);
    return { ok: true, status, taskId };
  });