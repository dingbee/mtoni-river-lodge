import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Executive Intelligence AI (Sprint 8F)
 *
 * Orchestration layer above Guest / Revenue / Marketing intelligence.
 * Deterministic aggregation only — no automatic changes to any operational
 * system. Every action surfaces existing pending recommendations for human
 * approval.
 */

const MODEL = "deterministic:mtoni-executive-v1";

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function today() { return iso(new Date()); }
function daysFromNow(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function daysAgo(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
function firstOfMonth() { const d = new Date(); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); }
function clamp(v: number, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }

async function logActivity(supabase: any, userId: string | null, tool: string, question: string, response: string) {
  try {
    await supabase.from("ai_activity_logs").insert({
      user_id: userId, question, domains_accessed: ["executive"], tool_called: tool,
      response, model: MODEL, status: "completed", duration_ms: 0,
    });
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Executive dashboard overview — aggregates from every existing module
// ---------------------------------------------------------------------------

export const getExecutiveOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [
      { data: rooms },
      { data: arrivalsToday },
      { data: departuresToday },
      { data: inHouse },
      { data: mtd },
      { data: forward30 },
      { data: outstanding },
      { data: openTasks },
      { data: openAlerts },
      { data: roomStates },
      { data: pendingGuestRecs },
      { data: pendingPricing },
      { data: pendingRevOps },
      { data: pendingMarketingRecs },
      { data: openRevAlerts },
      { data: openGuestAlerts },
      { data: openRisks },
      { data: reviews },
      { data: approvals },
    ] = await Promise.all([
      s.from("rooms").select("total_units").eq("status", "active"),
      s.from("bookings").select("id, guest_name, guest_type, check_in").eq("check_in", today()).in("status", ["confirmed","checked_in"]),
      s.from("bookings").select("id, guest_name, check_out").eq("check_out", today()).in("status", ["confirmed","checked_in","completed"]),
      s.from("bookings").select("id, nights").lte("check_in", today()).gt("check_out", today()).in("status", ["confirmed","checked_in"]),
      s.from("bookings").select("total, nights, currency").gte("check_in", firstOfMonth()).in("status", ["confirmed","checked_in","completed"]),
      s.from("bookings").select("total, nights").gte("check_in", today()).lte("check_in", daysFromNow(30)).in("status", ["confirmed","pending","checked_in"]),
      s.from("bookings").select("balance_due, currency").gt("balance_due", 0).in("status", ["confirmed","checked_in","completed"]),
      s.from("ops_tasks").select("id, priority").is("completed_at", null),
      s.from("ops_alerts").select("id, severity").is("resolved_at", null),
      s.from("room_states").select("state"),
      s.from("ai_guest_recommendations").select("id").eq("status", "pending"),
      s.from("ai_pricing_recommendations").select("id").eq("status", "pending"),
      s.from("ai_revenue_opportunities").select("id").eq("status", "pending"),
      s.from("ai_marketing_recommendations").select("id").eq("status", "pending"),
      s.from("ai_revenue_alerts").select("id, severity").eq("status", "open"),
      s.from("ai_guest_alerts").select("id, severity").eq("status", "open"),
      s.from("ai_strategic_risks").select("id, severity").eq("status", "open"),
      s.from("reviews").select("rating").eq("status", "approved").gte("created_at", daysAgo(180)),
      s.from("approval_requests").select("id").eq("status", "pending"),
    ]);

    const totalUnits = (rooms ?? []).reduce((sum, r) => sum + Number(r.total_units ?? 0), 0);
    const occupiedTonight = inHouse?.length ?? 0;
    const occupancyToday = totalUnits > 0 ? occupiedTonight / totalUnits : 0;

    const mtdRevenue = (mtd ?? []).reduce((s, b) => s + Number(b.total ?? 0), 0);
    const mtdNights = (mtd ?? []).reduce((s, b) => s + Number(b.nights ?? 0), 0);
    const revenueToday = 0; // deterministic proxy — real revenue lives in finance module
    const currency = (mtd?.[0] as any)?.currency ?? "USD";
    const forwardRevenue = (forward30 ?? []).reduce((s, b) => s + Number(b.total ?? 0), 0);
    const forwardNights = (forward30 ?? []).reduce((s, b) => s + Number(b.nights ?? 0), 0);
    const expectedOccupancy30 = totalUnits > 0 ? forwardNights / (totalUnits * 30) : 0;

    const outstandingTotal = (outstanding ?? []).reduce((s, b) => s + Number(b.balance_due ?? 0), 0);

    const vipToday = (arrivalsToday ?? []).filter((b) => b.guest_type === "vip" || b.guest_type === "climber").length;

    const housekeeping = { clean: 0, dirty: 0, inspected: 0, ooo: 0 };
    for (const r of roomStates ?? []) {
      const st = String((r as any).state ?? "");
      if (st in housekeeping) (housekeeping as any)[st] += 1;
    }

    const avgRating = (reviews ?? []).length
      ? (reviews ?? []).reduce((s, r) => s + Number(r.rating ?? 0), 0) / (reviews as any[]).length
      : 0;

    // Health scores (0-1)
    const revenueHealth = clamp(0.35 * (occupancyToday) + 0.4 * expectedOccupancy30 + 0.25 * (outstandingTotal === 0 ? 1 : 0.4));
    const marketingHealth = clamp(0.6 * (avgRating > 0 ? Math.min(1, avgRating / 5) : 0.5) + 0.4 * ((pendingMarketingRecs?.length ?? 0) < 10 ? 1 : 0.5));
    const guestSatisfactionHealth = clamp(avgRating > 0 ? avgRating / 5 : 0.5);

    const pendingRecommendations =
      (pendingGuestRecs?.length ?? 0) +
      (pendingPricing?.length ?? 0) +
      (pendingRevOps?.length ?? 0) +
      (pendingMarketingRecs?.length ?? 0);

    const activeAlerts =
      (openAlerts?.length ?? 0) +
      (openRevAlerts?.length ?? 0) +
      (openGuestAlerts?.length ?? 0) +
      (openRisks?.length ?? 0);

    const aiPriorityScore = Math.min(
      100,
      Math.round(
        (openRisks?.length ?? 0) * 15 +
          (openRevAlerts?.length ?? 0) * 8 +
          (openGuestAlerts?.length ?? 0) * 6 +
          (pendingRecommendations) * 2,
      ),
    );

    return {
      currency,
      totalUnits,
      occupancyToday,
      occupiedTonight,
      revenueToday,
      mtdRevenue,
      arrivalsToday: arrivalsToday?.length ?? 0,
      departuresToday: departuresToday?.length ?? 0,
      vipToday,
      housekeeping,
      outstandingTotal,
      forwardRevenue,
      expectedOccupancy30,
      openTasks: openTasks?.length ?? 0,
      activeAlerts,
      pendingRecommendations,
      pendingApprovals: approvals?.length ?? 0,
      revenueHealth,
      marketingHealth,
      guestSatisfactionHealth,
      aiPriorityScore,
      avgRating,
    };
  });

// ---------------------------------------------------------------------------
// Morning briefing — deterministic aggregation across every AI domain
// ---------------------------------------------------------------------------

export const generateExecutiveBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [
      { data: arrivals },
      { data: departures },
      { data: openTasks },
      { data: openAlerts },
      { data: guestRecs },
      { data: guestAlerts },
      { data: pricing },
      { data: revOps },
      { data: revAlerts },
      { data: forecasts },
      { data: marketingRecs },
      { data: marketingPriorities },
      { data: reputation },
      { data: risks },
    ] = await Promise.all([
      s.from("bookings").select("id, reference, guest_name, guest_type, room_id, adults, children, special_requests").eq("check_in", today()).in("status", ["confirmed","checked_in"]),
      s.from("bookings").select("id, reference, guest_name, balance_due").eq("check_out", today()).in("status", ["confirmed","checked_in","completed"]),
      s.from("ops_tasks").select("id, title, priority").is("completed_at", null).order("priority", { ascending: true }).limit(20),
      s.from("ops_alerts").select("id, message, severity").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
      s.from("ai_guest_recommendations").select("id, title, reasoning, confidence, impact_score, kind").eq("status","pending").order("impact_score",{ ascending: false, nullsFirst: false }).limit(10),
      s.from("ai_guest_alerts").select("id, title, severity, reasoning").eq("status","open").order("severity",{ ascending: false }).limit(10),
      s.from("ai_pricing_recommendations").select("id, title, reasoning, confidence, impact_score, action").eq("status","pending").order("impact_score",{ ascending: false, nullsFirst: false }).limit(10),
      s.from("ai_revenue_opportunities").select("id, title, reasoning, confidence, impact_score, kind").eq("status","pending").order("impact_score",{ ascending: false, nullsFirst: false }).limit(10),
      s.from("ai_revenue_alerts").select("id, title, severity, reasoning").eq("status","open").order("severity",{ ascending: false }).limit(10),
      s.from("ai_revenue_forecasts").select("horizon_days, expected_occupancy, expected_revenue, currency").order("created_at",{ ascending: false }).limit(3),
      s.from("ai_marketing_recommendations").select("id, title, reasoning, confidence, impact_score, kind").eq("status","pending").order("impact_score",{ ascending: false, nullsFirst: false }).limit(10),
      s.from("ai_marketing_priorities").select("id, title, reasoning, priority_score").order("priority_score",{ ascending: false, nullsFirst: false }).limit(5),
      s.from("ai_reputation_insights").select("id, summary, avg_rating, review_count").order("created_at",{ ascending: false }).limit(1),
      s.from("ai_strategic_risks").select("id, title, severity, reasoning").eq("status","open").order("severity",{ ascending: false }).limit(10),
    ]);

    // Merge & rank top recommendations across domains
    const all = [
      ...(guestRecs ?? []).map((r) => ({ ...r, origin: "guest" })),
      ...(pricing ?? []).map((r) => ({ ...r, origin: "revenue.pricing" })),
      ...(revOps ?? []).map((r) => ({ ...r, origin: "revenue.opportunity" })),
      ...(marketingRecs ?? []).map((r) => ({ ...r, origin: "marketing" })),
    ];
    const ranked = all
      .map((r) => ({
        ...r,
        _rank: (Number(r.impact_score ?? 0)) * (Number(r.confidence ?? 0.5) || 0.5),
      }))
      .sort((a, b) => b._rank - a._rank)
      .slice(0, 10);

    const sections = {
      operations: {
        arrivals: arrivals ?? [],
        departures: departures ?? [],
        openTasks: openTasks ?? [],
        openAlerts: openAlerts ?? [],
      },
      guests: {
        recommendations: guestRecs ?? [],
        alerts: guestAlerts ?? [],
        vipToday: (arrivals ?? []).filter((b) => b.guest_type === "vip" || b.guest_type === "climber"),
      },
      revenue: {
        forecasts: forecasts ?? [],
        pricing: pricing ?? [],
        opportunities: revOps ?? [],
        alerts: revAlerts ?? [],
      },
      marketing: {
        recommendations: marketingRecs ?? [],
        priorities: marketingPriorities ?? [],
        reputation: reputation?.[0] ?? null,
      },
      risks: risks ?? [],
    };

    const summary = buildSummaryText(sections, ranked);

    const { data: row, error } = await s
      .from("ai_executive_briefings")
      .upsert(
        {
          briefing_date: today(),
          summary,
          sections,
          top_recommendations: ranked,
          evidence: {
            counts: {
              guest_recs: guestRecs?.length ?? 0,
              pricing_recs: pricing?.length ?? 0,
              revenue_ops: revOps?.length ?? 0,
              marketing_recs: marketingRecs?.length ?? 0,
              risks: risks?.length ?? 0,
            },
          },
          generated_by: context.userId,
        },
        { onConflict: "briefing_date" },
      )
      .select("*")
      .single();
    if (error) throw error;

    await logActivity(s, context.userId, "executive.briefing.generate", "Generate morning briefing", summary.slice(0, 500));
    return row;
  });

function buildSummaryText(sections: any, ranked: any[]): string {
  const parts: string[] = [];
  parts.push(`Arrivals today: ${sections.operations.arrivals.length}. Departures: ${sections.operations.departures.length}.`);
  if (sections.guests.vipToday.length) parts.push(`VIP/climber arrivals: ${sections.guests.vipToday.length}.`);
  if (sections.revenue.forecasts.length) {
    const f = sections.revenue.forecasts[0];
    parts.push(`Forward ${f.horizon_days}d occupancy forecast ${(Number(f.expected_occupancy ?? 0) * 100).toFixed(0)}%.`);
  }
  if (sections.risks.length) parts.push(`${sections.risks.length} open strategic risk(s).`);
  if (ranked.length) parts.push(`Top recommendation: ${ranked[0].title}.`);
  return parts.join(" ");
}

export const getLatestBriefing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_executive_briefings")
      .select("*")
      .order("briefing_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });

// ---------------------------------------------------------------------------
// Decision queue — union of every pending AI recommendation
// ---------------------------------------------------------------------------

type DecisionRow = {
  id: string; origin: string; module: string; title: string; reasoning: string | null;
  confidence: number | null; impact_score: number | null; kind: string | null;
  action: string | null; status: string; created_at: string; route: string;
  priority: number;
};

export const getExecutiveDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [
      { data: guest },
      { data: pricing },
      { data: revOps },
      { data: marketing },
      { data: approvals },
    ] = await Promise.all([
      s.from("ai_guest_recommendations").select("id, title, reasoning, confidence, impact_score, kind, status, created_at, booking_id").eq("status","pending"),
      s.from("ai_pricing_recommendations").select("id, title, reasoning, confidence, impact_score, action, status, created_at").eq("status","pending"),
      s.from("ai_revenue_opportunities").select("id, title, reasoning, confidence, impact_score, kind, status, created_at").eq("status","pending"),
      s.from("ai_marketing_recommendations").select("id, title, reasoning, confidence, impact_score, kind, status, created_at").eq("status","pending"),
      s.from("approval_requests").select("id, title, description, status, created_at").eq("status","pending"),
    ]);

    const rows: DecisionRow[] = [
      ...(guest ?? []).map((r): DecisionRow => ({
        id: r.id, origin: "Guest Intelligence", module: "guest",
        title: r.title, reasoning: r.reasoning,
        confidence: r.confidence, impact_score: r.impact_score,
        kind: r.kind, action: null, status: r.status, created_at: r.created_at,
        route: r.booking_id ? `/admin/ai/guests/${r.booking_id}` : "/admin/ai/guests/dashboard",
        priority: (Number(r.impact_score ?? 0)) * (Number(r.confidence ?? 0.5) || 0.5),
      })),
      ...(pricing ?? []).map((r): DecisionRow => ({
        id: r.id, origin: "Revenue · Pricing", module: "revenue.pricing",
        title: r.title, reasoning: r.reasoning,
        confidence: r.confidence, impact_score: r.impact_score,
        kind: null, action: r.action, status: r.status, created_at: r.created_at,
        route: "/admin/ai/revenue/pricing",
        priority: (Number(r.impact_score ?? 0)) * (Number(r.confidence ?? 0.5) || 0.5),
      })),
      ...(revOps ?? []).map((r): DecisionRow => ({
        id: r.id, origin: "Revenue · Opportunity", module: "revenue.opportunity",
        title: r.title, reasoning: r.reasoning,
        confidence: r.confidence, impact_score: r.impact_score,
        kind: r.kind, action: null, status: r.status, created_at: r.created_at,
        route: "/admin/ai/revenue/opportunities",
        priority: (Number(r.impact_score ?? 0)) * (Number(r.confidence ?? 0.5) || 0.5),
      })),
      ...(marketing ?? []).map((r): DecisionRow => ({
        id: r.id, origin: "Marketing", module: "marketing",
        title: r.title, reasoning: r.reasoning,
        confidence: r.confidence, impact_score: r.impact_score,
        kind: r.kind, action: null, status: r.status, created_at: r.created_at,
        route: "/admin/ai/marketing/priorities",
        priority: (Number(r.impact_score ?? 0)) * (Number(r.confidence ?? 0.5) || 0.5),
      })),
    ];

    rows.sort((a, b) => b.priority - a.priority);
    return {
      decisions: rows,
      approvals: approvals ?? [],
    };
  });

// Cross-module decision action — forwards to the originating module's table.
export const decideExecutiveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; module: string; action: "accept" | "dismiss" | "assign" | "convert"; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const table = {
      "guest": "ai_guest_recommendations",
      "revenue.pricing": "ai_pricing_recommendations",
      "revenue.opportunity": "ai_revenue_opportunities",
      "marketing": "ai_marketing_recommendations",
    }[data.module];
    if (!table) throw new Error(`Unknown module: ${data.module}`);

    const newStatus =
      data.action === "accept" ? "accepted"
      : data.action === "dismiss" ? "dismissed"
      : data.action === "convert" ? "converted"
      : "assigned";

    const { data: row, error } = await (s.from(table as any) as any)
      .update({ status: newStatus, reviewed_by: context.userId, reviewed_at: new Date().toISOString(), review_note: data.note ?? null })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;

    // Convert to ops task when requested
    if (data.action === "convert" && row) {
      await s.from("ops_tasks").insert({
        task_type: "ai_conversion",
        title: (row as any).title ?? "AI recommendation",
        description: (row as any).reasoning ?? "",
        priority: 2,
      });
    }

    await logActivity(s, context.userId, "executive.decision", `Decision ${data.action} on ${data.module}#${data.id}`, `Status→${newStatus}`);
    return row;
  });

// ---------------------------------------------------------------------------
// KPI Centre
// ---------------------------------------------------------------------------

export const getExecutiveKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { period: "week" | "month" | "quarter" | "year" }) => d)
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const { data: snaps } = await s
      .from("ai_executive_kpi_snapshots")
      .select("*")
      .eq("period", data.period)
      .order("period_start", { ascending: false })
      .limit(24);

    // Live current-period KPI
    const [{ data: rooms }, { data: bookings }, { data: reviews }, { data: adopted }, { data: total }] = await Promise.all([
      s.from("rooms").select("total_units").eq("status","active"),
      s.from("bookings").select("total, nights, status, created_at, guest_id").gte("check_in", daysAgo(365)),
      s.from("reviews").select("rating").eq("status","approved").gte("created_at", daysAgo(365)),
      s.from("ai_activity_logs").select("id").in("status", ["completed"]).gte("created_at", daysAgo(90)),
      s.from("ai_guest_recommendations").select("id, status").gte("created_at", daysAgo(90)),
    ]);
    const totalUnits = (rooms ?? []).reduce((a, r) => a + Number(r.total_units ?? 0), 0);
    const nights365 = (bookings ?? []).reduce((a, b) => a + Number(b.nights ?? 0), 0);
    const revenue365 = (bookings ?? [])
      .filter((b) => ["confirmed","checked_in","completed"].includes(b.status))
      .reduce((a, b) => a + Number(b.total ?? 0), 0);
    const capacity365 = totalUnits * 365;
    const occupancy = capacity365 > 0 ? nights365 / capacity365 : 0;
    const adr = nights365 > 0 ? revenue365 / nights365 : 0;
    const revpar = capacity365 > 0 ? revenue365 / capacity365 : 0;

    const guestIds = new Set<string>();
    const repeatCounts = new Map<string, number>();
    for (const b of bookings ?? []) {
      const gid = (b as any).guest_id; if (!gid) continue;
      guestIds.add(gid);
      repeatCounts.set(gid, (repeatCounts.get(gid) ?? 0) + 1);
    }
    const repeat = guestIds.size ? Array.from(repeatCounts.values()).filter((n) => n > 1).length / guestIds.size : 0;

    const avgReview = (reviews ?? []).length
      ? (reviews ?? []).reduce((a, r) => a + Number(r.rating ?? 0), 0) / (reviews as any[]).length : 0;

    const totalRecs = total?.length ?? 0;
    const acceptedRecs = (total ?? []).filter((r) => r.status === "accepted" || r.status === "converted").length;
    const adoption = totalRecs > 0 ? acceptedRecs / totalRecs : 0;

    return {
      period: data.period,
      live: { occupancy, adr, revpar, avgReview, repeat, aiAdoption: adoption, aiRunsLast90: adopted?.length ?? 0 },
      snapshots: snaps ?? [],
    };
  });

export const captureKpiSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { period: "week" | "month" | "quarter" | "year" }) => d)
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const now = new Date();
    const start = new Date(now);
    if (data.period === "week") start.setUTCDate(start.getUTCDate() - 7);
    if (data.period === "month") start.setUTCMonth(start.getUTCMonth() - 1);
    if (data.period === "quarter") start.setUTCMonth(start.getUTCMonth() - 3);
    if (data.period === "year") start.setUTCFullYear(start.getUTCFullYear() - 1);
    const period_start = iso(start);
    const period_end = today();

    const [{ data: rooms }, { data: bookings }, { data: reviews }] = await Promise.all([
      s.from("rooms").select("total_units").eq("status","active"),
      s.from("bookings").select("total, nights, status, guest_id").gte("check_in", period_start).lte("check_in", period_end),
      s.from("reviews").select("rating").eq("status","approved").gte("created_at", period_start),
    ]);
    const totalUnits = (rooms ?? []).reduce((a, r) => a + Number(r.total_units ?? 0), 0);
    const days = Math.max(1, Math.round((+new Date(period_end) - +new Date(period_start)) / 86400000));
    const capacity = totalUnits * days;
    const nights = (bookings ?? []).reduce((a, b) => a + Number(b.nights ?? 0), 0);
    const revenue = (bookings ?? []).filter((b) => ["confirmed","checked_in","completed"].includes(b.status)).reduce((a, b) => a + Number(b.total ?? 0), 0);

    const kpis = {
      occupancy: capacity > 0 ? nights / capacity : 0,
      revenue,
      adr: nights > 0 ? revenue / nights : 0,
      revpar: capacity > 0 ? revenue / capacity : 0,
      avgReview: (reviews ?? []).length ? (reviews ?? []).reduce((a, r) => a + Number(r.rating ?? 0), 0) / (reviews as any[]).length : 0,
      bookings: (bookings ?? []).length,
    };

    const { data: row, error } = await s
      .from("ai_executive_kpi_snapshots")
      .upsert({ period: data.period, period_start, period_end, kpis, evidence: { rooms: totalUnits, days, nights } }, { onConflict: "period,period_start" })
      .select("*").single();
    if (error) throw error;
    return row;
  });

// ---------------------------------------------------------------------------
// Strategic Risk Detection
// ---------------------------------------------------------------------------

export const detectStrategicRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [
      { data: past30 }, { data: prev30 }, { data: forward30 }, { data: rooms },
      { data: outstanding }, { data: reviewsRecent }, { data: reviewsOlder },
      { data: campaigns }, { data: openTasks },
    ] = await Promise.all([
      s.from("bookings").select("total, status, created_at").gte("created_at", daysAgo(30)),
      s.from("bookings").select("total, status, created_at").gte("created_at", daysAgo(60)).lt("created_at", daysAgo(30)),
      s.from("bookings").select("nights, status, check_in").gte("check_in", today()).lte("check_in", daysFromNow(30)),
      s.from("rooms").select("total_units").eq("status","active"),
      s.from("bookings").select("balance_due").gt("balance_due", 0),
      s.from("reviews").select("rating").eq("status","approved").gte("created_at", daysAgo(60)),
      s.from("reviews").select("rating").eq("status","approved").gte("created_at", daysAgo(180)).lt("created_at", daysAgo(60)),
      s.from("campaigns").select("id, status, end_date"),
      s.from("ops_tasks").select("id").is("completed_at", null),
    ]);

    const detected: Array<{ risk_type: string; severity: string; title: string; reasoning: string; evidence: any; domains: string[] }> = [];

    const rev30 = (past30 ?? []).filter((b) => ["confirmed","checked_in","completed"].includes(b.status)).reduce((a, b) => a + Number(b.total ?? 0), 0);
    const revPrev = (prev30 ?? []).filter((b) => ["confirmed","checked_in","completed"].includes(b.status)).reduce((a, b) => a + Number(b.total ?? 0), 0);
    if (revPrev > 0 && rev30 / revPrev < 0.85) {
      const drop = 1 - rev30 / revPrev;
      detected.push({
        risk_type: "revenue_decline",
        severity: drop > 0.3 ? "critical" : drop > 0.2 ? "high" : "medium",
        title: `Revenue down ${(drop * 100).toFixed(0)}% vs previous 30d`,
        reasoning: `Trailing 30d revenue ${rev30.toFixed(0)} vs prior 30d ${revPrev.toFixed(0)}.`,
        evidence: { rev30, revPrev }, domains: ["revenue","finance"],
      });
    }

    const totalUnits = (rooms ?? []).reduce((a, r) => a + Number(r.total_units ?? 0), 0);
    const forwardNights = (forward30 ?? []).reduce((a, b) => a + Number(b.nights ?? 0), 0);
    const expectedOcc = totalUnits > 0 ? forwardNights / (totalUnits * 30) : 0;
    if (expectedOcc < 0.4 && totalUnits > 0) {
      detected.push({
        risk_type: "occupancy_decline",
        severity: expectedOcc < 0.25 ? "high" : "medium",
        title: `Forward 30d occupancy only ${(expectedOcc * 100).toFixed(0)}%`,
        reasoning: `${forwardNights} confirmed/pending nights against ${totalUnits * 30} capacity.`,
        evidence: { expectedOcc, forwardNights, capacity: totalUnits * 30 }, domains: ["revenue","marketing"],
      });
    }

    const avgRecent = (reviewsRecent ?? []).length ? (reviewsRecent ?? []).reduce((a, r) => a + Number(r.rating ?? 0), 0) / (reviewsRecent as any[]).length : 0;
    const avgOlder = (reviewsOlder ?? []).length ? (reviewsOlder ?? []).reduce((a, r) => a + Number(r.rating ?? 0), 0) / (reviewsOlder as any[]).length : 0;
    if (avgRecent > 0 && avgOlder > 0 && avgOlder - avgRecent > 0.3) {
      detected.push({
        risk_type: "guest_satisfaction_decline",
        severity: avgOlder - avgRecent > 0.6 ? "high" : "medium",
        title: `Review score dropped from ${avgOlder.toFixed(2)}★ to ${avgRecent.toFixed(2)}★`,
        reasoning: `Recent 60d review average is materially below the prior 180-60d window.`,
        evidence: { avgRecent, avgOlder }, domains: ["guest","marketing"],
      });
    }

    const outstandingTotal = (outstanding ?? []).reduce((a, b) => a + Number(b.balance_due ?? 0), 0);
    if (outstandingTotal > 5000) {
      detected.push({
        risk_type: "cash_flow",
        severity: outstandingTotal > 20000 ? "high" : "medium",
        title: `Outstanding balances total ${outstandingTotal.toFixed(0)}`,
        reasoning: `Cash-flow exposure across unpaid bookings.`,
        evidence: { outstandingTotal }, domains: ["finance"],
      });
    }

    const runningCampaigns = (campaigns ?? []).filter((c) => c.status === "running").length;
    if (runningCampaigns === 0) {
      detected.push({
        risk_type: "campaign_inactivity",
        severity: "low",
        title: "No active marketing campaigns",
        reasoning: "No campaigns in the running state — demand pipeline may weaken.",
        evidence: { totalCampaigns: campaigns?.length ?? 0 }, domains: ["marketing"],
      });
    }

    if ((openTasks?.length ?? 0) > 40) {
      detected.push({
        risk_type: "operational_bottleneck",
        severity: (openTasks?.length ?? 0) > 100 ? "high" : "medium",
        title: `${openTasks?.length} open operational tasks`,
        reasoning: "Task backlog above healthy threshold; risk of missed guest actions.",
        evidence: { openTasks: openTasks?.length ?? 0 }, domains: ["operations"],
      });
    }

    // Upsert: only insert risk_type not already open
    const { data: existingOpen } = await s.from("ai_strategic_risks").select("risk_type").eq("status","open");
    const openSet = new Set((existingOpen ?? []).map((r) => r.risk_type));
    const toInsert = detected.filter((r) => !openSet.has(r.risk_type));
    if (toInsert.length) {
      await s.from("ai_strategic_risks").insert(toInsert);
    }

    await logActivity(s, context.userId, "executive.risks.detect", "Detect strategic risks", `Detected ${detected.length}, inserted ${toInsert.length}`);
    return { detected, inserted: toInsert.length };
  });

export const listStrategicRisks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_strategic_risks")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const updateRiskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "open" | "acknowledged" | "mitigated" | "dismissed" }) => d)
  .handler(async ({ data, context }) => {
    const patch: any = { status: data.status };
    if (data.status === "mitigated" || data.status === "dismissed") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = context.userId;
    }
    const { data: row, error } = await context.supabase
      .from("ai_strategic_risks").update(patch).eq("id", data.id).select("*").maybeSingle();
    if (error) throw error;
    return row;
  });

// ---------------------------------------------------------------------------
// Executive timeline — reuse ai_activity_logs
// ---------------------------------------------------------------------------

export const getExecutiveTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("ai_activity_logs")
      .select("id, user_id, question, tool_called, response, domains_accessed, model, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

// ---------------------------------------------------------------------------
// AI Value Engine
// ---------------------------------------------------------------------------

export const getAiValueSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [{ data: guest }, { data: pricing }, { data: revOps }, { data: marketing }, { data: activity }] = await Promise.all([
      s.from("ai_guest_recommendations").select("status, impact_score").gte("created_at", daysAgo(90)),
      s.from("ai_pricing_recommendations").select("status, impact_score").gte("created_at", daysAgo(90)),
      s.from("ai_revenue_opportunities").select("status, impact_score").gte("created_at", daysAgo(90)),
      s.from("ai_marketing_recommendations").select("status, impact_score").gte("created_at", daysAgo(90)),
      s.from("ai_activity_logs").select("id").gte("created_at", daysAgo(90)),
    ]);
    const buckets = [
      { key: "guest", rows: guest ?? [] },
      { key: "revenue.pricing", rows: pricing ?? [] },
      { key: "revenue.opportunity", rows: revOps ?? [] },
      { key: "marketing", rows: marketing ?? [] },
    ];
    const totals = { generated: 0, accepted: 0, dismissed: 0, converted: 0, valueEstimate: 0 };
    const perModule: Record<string, { generated: number; accepted: number; dismissed: number; converted: number; value: number }> = {};
    for (const b of buckets) {
      const g = b.rows.length;
      const a = b.rows.filter((r) => r.status === "accepted").length;
      const dm = b.rows.filter((r) => r.status === "dismissed").length;
      const cv = b.rows.filter((r) => r.status === "converted").length;
      const v = b.rows.filter((r) => r.status === "accepted" || r.status === "converted").reduce((s: number, r: any) => s + Number(r.impact_score ?? 0), 0);
      perModule[b.key] = { generated: g, accepted: a, dismissed: dm, converted: cv, value: v };
      totals.generated += g; totals.accepted += a; totals.dismissed += dm; totals.converted += cv; totals.valueEstimate += v;
    }
    return {
      totals,
      perModule,
      aiRuns: activity?.length ?? 0,
      adoption: totals.generated > 0 ? (totals.accepted + totals.converted) / totals.generated : 0,
    };
  });