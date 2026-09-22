import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function daysAgoISO(n: number) { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function pct(cur: number, prev: number) { if (!prev) return cur ? 100 : 0; return ((cur - prev) / prev) * 100; }

type Row = Record<string, any>;

export const getAnalyticsHub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const today = todayISO();
    const start30 = daysAgoISO(30);
    const [{ data: bookings30 }, { data: todayBookings }, { data: rooms }, { data: aiLogs }, { data: opsAlerts }, { data: reviews }, { data: campaigns }] = await Promise.all([
      s.from("bookings").select("id, total, status, check_in, check_out, nights, created_at, payment_status").gte("created_at", start30),
      s.from("bookings").select("id, status").eq("check_in", today),
      s.from("rooms").select("id, total_units").eq("status", "active"),
      s.from("ai_activity_logs").select("id, created_at").gte("created_at", start30),
      s.from("ops_alerts").select("id, resolved_at").is("resolved_at", null),
      s.from("reviews").select("rating").eq("status", "approved").gte("created_at", start30),
      s.from("campaigns").select("id, status").eq("status", "running"),
    ]);
    const b30 = (bookings30 ?? []) as Row[];
    const active = b30.filter((b) => b.status !== "cancelled");
    const totalUnits = (rooms ?? []).reduce((n: number, r: any) => n + (r.total_units ?? 1), 0) || 1;
    const roomNights = active.reduce((n, b) => n + (b.nights ?? 0), 0);
    const revenue = active.reduce((n, b) => n + Number(b.total ?? 0), 0);
    const adr = roomNights ? revenue / roomNights : 0;
    const revpar = totalUnits ? revenue / (totalUnits * 30) : 0;
    const occupancy = Math.min(1, roomNights / (totalUnits * 30));
    const cancelRate = b30.length ? b30.filter((b) => b.status === "cancelled").length / b30.length : 0;
    const avgRating = (reviews ?? []).length ? (reviews ?? []).reduce((n: number, r: any) => n + Number(r.rating ?? 0), 0) / (reviews ?? []).length : 0;
    return {
      today: {
        arrivalsCount: (todayBookings ?? []).length,
        occupancy, adr, revpar, revenue,
        bookings30d: b30.length, cancelRate, avgRating,
        aiInteractions30d: (aiLogs ?? []).length,
        openAlerts: (opsAlerts ?? []).length,
        activeCampaigns: (campaigns ?? []).length,
      },
    };
  });

const rangeSchema = z.object({ days: z.number().min(1).max(365).default(30) }).default({ days: 30 });

export const getBookingAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = daysAgoISO(data.days);
    const { data: bookings } = await context.supabase
      .from("bookings")
      .select("id, created_at, check_in, check_out, nights, source, country, room_id, status, total, adults, children")
      .gte("created_at", from);
    const b = (bookings ?? []) as Row[];
    const byDay = new Map<string, number>();
    const bySource = new Map<string, number>();
    const byRoom = new Map<string, number>();
    let leadSum = 0, staySum = 0, cancelled = 0;
    for (const row of b) {
      const day = String(row.created_at).slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      bySource.set(row.source ?? "direct", (bySource.get(row.source ?? "direct") ?? 0) + 1);
      byRoom.set(row.room_id ?? "unknown", (byRoom.get(row.room_id ?? "unknown") ?? 0) + 1);
      const lead = (new Date(row.check_in).getTime() - new Date(row.created_at).getTime()) / (86400 * 1000);
      leadSum += Math.max(0, lead);
      staySum += row.nights ?? 0;
      if (row.status === "cancelled") cancelled++;
    }
    const { data: extras } = await context.supabase.from("booking_extras").select("booking_id").limit(2000);
    const withExtras = new Set((extras ?? []).map((e: any) => e.booking_id));
    const attachRate = b.length ? [...withExtras].filter((id) => b.find((x) => x.id === id)).length / b.length : 0;
    return {
      total: b.length,
      cancelled,
      cancelRate: b.length ? cancelled / b.length : 0,
      avgLeadDays: b.length ? leadSum / b.length : 0,
      avgStayNights: b.length ? staySum / b.length : 0,
      attachRate,
      byDay: [...byDay.entries()].sort().map(([day, count]) => ({ day, count })),
      bySource: [...bySource.entries()].map(([source, count]) => ({ source, count })),
      byRoom: [...byRoom.entries()].map(([roomId, count]) => ({ roomId, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    };
  });

export const getWebsiteAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sessions } = await context.supabase
      .from("ai_concierge_sessions")
      .select("id, created_at, channel")
      .gte("created_at", daysAgoISO(30));
    return {
      note: "Traffic, sessions, sources, devices — connect GA4 or wire server-side proxy.",
      conciergeSessions30d: (sessions ?? []).length,
      topLandingPages: [] as { path: string; visits: number }[],
      trafficSources: [] as { source: string; visits: number }[],
    };
  });

export const getRevenueAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = daysAgoISO(data.days);
    const { data: rows } = await context.supabase
      .from("bookings")
      .select("id, total, paid_amount, balance_amount, check_in, nights, status, payment_status")
      .gte("check_in", from);
    const b = ((rows ?? []) as Row[]).filter((r) => r.status !== "cancelled");
    const revByDay = new Map<string, number>();
    let revenue = 0, paid = 0, outstanding = 0, roomNights = 0;
    for (const r of b) {
      const day = String(r.check_in);
      revByDay.set(day, (revByDay.get(day) ?? 0) + Number(r.total ?? 0));
      revenue += Number(r.total ?? 0);
      paid += Number(r.paid_amount ?? 0);
      outstanding += Number(r.balance_amount ?? 0);
      roomNights += r.nights ?? 0;
    }
    const { data: rooms } = await context.supabase.from("rooms").select("id, total_units").eq("status", "active");
    const totalUnits = (rooms ?? []).reduce((n: number, r: any) => n + (r.total_units ?? 1), 0) || 1;
    return {
      revenue, paid, outstanding,
      paymentCompletion: revenue ? paid / revenue : 0,
      adr: roomNights ? revenue / roomNights : 0,
      revpar: totalUnits ? revenue / (totalUnits * data.days) : 0,
      occupancy: Math.min(1, roomNights / (totalUnits * data.days)),
      byDay: [...revByDay.entries()].sort().map(([day, total]) => ({ day, total })),
    };
  });

export const getMarketingAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const from = daysAgoISO(30);
    const [{ data: campaigns }, { data: journal }, { data: reviews }, { data: seoRecs }] = await Promise.all([
      context.supabase.from("campaigns").select("id, name, status, created_at").gte("created_at", from),
      context.supabase.from("journal_articles").select("id, title, slug, status, published_at").eq("status", "published").order("published_at", { ascending: false }).limit(10),
      context.supabase.from("reviews").select("id, rating, source, created_at").eq("status", "approved").gte("created_at", from),
      context.supabase.from("ai_marketing_recommendations").select("id, status").gte("created_at", from),
    ]);
    return {
      campaigns: (campaigns ?? []).length,
      topArticles: journal ?? [],
      reviewCount: (reviews ?? []).length,
      avgReview: (reviews ?? []).length ? (reviews ?? []).reduce((n: number, r: any) => n + Number(r.rating ?? 0), 0) / (reviews ?? []).length : 0,
      seoRecommendations: (seoRecs ?? []).length,
    };
  });

export const getOperationsAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const from = daysAgoISO(30);
    const [{ data: tasks }, { data: alerts }, { data: recovery }, { data: readiness }] = await Promise.all([
      context.supabase.from("ops_tasks").select("id, status, task_type, created_at, completed_at").gte("created_at", from),
      context.supabase.from("ops_alerts").select("id, status, created_at").gte("created_at", from),
      context.supabase.from("ai_service_recovery_insights").select("id, status").gte("created_at", from),
      context.supabase.from("ai_room_readiness_insights").select("id, priority, status").gte("created_at", from),
    ]);
    const t = (tasks ?? []) as Row[];
    const done = t.filter((r) => r.status === "done" || r.status === "completed").length;
    return {
      tasksTotal: t.length,
      tasksCompleted: done,
      completionRate: t.length ? done / t.length : 0,
      alertsOpen: (alerts ?? []).filter((a: any) => a.status === "open").length,
      recoveryCases: (recovery ?? []).length,
      readinessInsights: (readiness ?? []).length,
    };
  });

export const getAiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const from = daysAgoISO(30);
    const s = context.supabase;
    const [logs, feedback, escalations, concierge, copilot, guestRecs, revRecs, mktRecs] = await Promise.all([
      s.from("ai_activity_logs").select("id, module, latency_ms, success, created_at").gte("created_at", from),
      s.from("ai_feedback").select("id, rating").gte("created_at", from),
      s.from("ai_escalations").select("id, status").gte("created_at", from),
      s.from("ai_concierge_sessions").select("id, created_at").gte("created_at", from),
      s.from("ai_copilot_sessions").select("id, created_at").gte("created_at", from),
      s.from("ai_guest_recommendations").select("id, status").gte("created_at", from),
      s.from("ai_pricing_recommendations").select("id, status").gte("created_at", from),
      s.from("ai_marketing_recommendations").select("id, status").gte("created_at", from),
    ]);
    const l = (logs.data ?? []) as Row[];
    const byModule = new Map<string, { count: number; latency: number; success: number }>();
    for (const r of l) {
      const m = r.module ?? "general";
      const cur = byModule.get(m) ?? { count: 0, latency: 0, success: 0 };
      cur.count++; cur.latency += Number(r.latency_ms ?? 0); cur.success += r.success ? 1 : 0;
      byModule.set(m, cur);
    }
    const acceptedOf = (rows: Row[] | null) => (rows ?? []).filter((r) => r.status === "accepted" || r.status === "approved").length;
    const dismissedOf = (rows: Row[] | null) => (rows ?? []).filter((r) => r.status === "dismissed" || r.status === "rejected").length;
    const fbList = (feedback.data ?? []) as Row[];
    return {
      totalQuestions: l.length,
      avgLatency: l.length ? l.reduce((n, r) => n + Number(r.latency_ms ?? 0), 0) / l.length : 0,
      successRate: l.length ? l.filter((r) => r.success).length / l.length : 0,
      helpfulFeedback: fbList.filter((r) => r.rating === "helpful" || r.rating === "up").length,
      escalations: (escalations.data ?? []).length,
      conciergeSessions: (concierge.data ?? []).length,
      copilotSessions: (copilot.data ?? []).length,
      recommendations: {
        guest: { accepted: acceptedOf(guestRecs.data), dismissed: dismissedOf(guestRecs.data) },
        revenue: { accepted: acceptedOf(revRecs.data), dismissed: dismissedOf(revRecs.data) },
        marketing: { accepted: acceptedOf(mktRecs.data), dismissed: dismissedOf(mktRecs.data) },
      },
      byModule: [...byModule.entries()].map(([module, v]) => ({
        module, count: v.count,
        avgLatency: v.count ? v.latency / v.count : 0,
        successRate: v.count ? v.success / v.count : 0,
      })),
    };
  });

export const getExecutiveAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const from = daysAgoISO(30);
    const [{ data: risks }, { data: recs }, { data: bookings }, { data: reviews }, { data: alerts }] = await Promise.all([
      s.from("ai_strategic_risks").select("id, severity, status"),
      s.from("ai_analytics_recommendations").select("id, status, impact, title, confidence").order("created_at", { ascending: false }).limit(10),
      s.from("bookings").select("id, total, status").gte("created_at", from),
      s.from("reviews").select("rating").eq("status", "approved").gte("created_at", from),
      s.from("ops_alerts").select("id, resolved_at").is("resolved_at", null),
    ]);
    const b = ((bookings ?? []) as Row[]).filter((r) => r.status !== "cancelled");
    const rev = b.reduce((n, r) => n + Number(r.total ?? 0), 0);
    const rating = (reviews ?? []).length ? (reviews ?? []).reduce((n: number, r: any) => n + Number(r.rating ?? 0), 0) / (reviews ?? []).length : 0;
    const openRisks = (risks ?? []).filter((r: any) => r.status !== "resolved").length;
    const financialHealth = Math.min(100, Math.round(rev / 500));
    const marketingHealth = Math.max(0, Math.min(100, Math.round((rating - 3) * 33 + 50)));
    const operationalHealth = Math.max(0, 100 - (alerts ?? []).length * 8);
    const guestSatisfaction = Math.round(rating * 20);
    const aiHealth = 90 - Math.min(50, openRisks * 5);
    return {
      health: { financialHealth, marketingHealth, operationalHealth, guestSatisfaction, aiHealth },
      risks: risks ?? [],
      topOpportunities: recs ?? [],
      weeklySummary: `${b.length} bookings · $${Math.round(rev).toLocaleString()} revenue · ${(reviews ?? []).length} new reviews · ${openRisks} open risks.`,
    };
  });

const reportKindSchema = z.object({ kind: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]) });

export const generateAnalyticsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reportKindSchema.parse(d))
  .handler(async ({ data, context }) => {
    const dayMap = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, annual: 365 } as const;
    const days = dayMap[data.kind];
    const start = daysAgoISO(days);
    const end = todayISO();
    const { data: bookings } = await context.supabase.from("bookings").select("id, total, status, nights").gte("created_at", start);
    const active = ((bookings ?? []) as Row[]).filter((b) => b.status !== "cancelled");
    const revenue = active.reduce((n, b) => n + Number(b.total ?? 0), 0);
    const payload = {
      period: data.kind,
      totals: {
        bookings: active.length,
        cancelled: (bookings ?? []).length - active.length,
        revenue,
        nights: active.reduce((n, b) => n + (b.nights ?? 0), 0),
      },
    };
    const { data: inserted, error } = await context.supabase
      .from("analytics_reports")
      .insert({
        kind: data.kind, period: data.kind,
        period_start: start, period_end: end,
        title: `${data.kind[0].toUpperCase() + data.kind.slice(1)} report — ${end}`,
        summary: `${active.length} bookings, $${Math.round(revenue).toLocaleString()} revenue over last ${days} days.`,
        payload, status: "draft",
      })
      .select().single();
    if (error) throw error;
    return inserted;
  });

export const listAnalyticsReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("analytics_reports")
      .select("id, kind, period, period_start, period_end, title, summary, status, created_at")
      .order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

async function bookingsSum(supabase: any, days: number) {
  const { data } = await supabase.from("bookings").select("total, status, nights, created_at").gte("created_at", daysAgoISO(days));
  const active = ((data ?? []) as Row[]).filter((b) => b.status !== "cancelled");
  return {
    revenue: active.reduce((n, r) => n + Number(r.total ?? 0), 0),
    bookings: active.length,
    nights: active.reduce((n, r) => n + (r.nights ?? 0), 0),
  };
}

export const computeTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const windows = [7, 30, 90, 365];
    const out: any[] = [];
    for (const w of windows) {
      const cur = await bookingsSum(context.supabase, w);
      const prev = await bookingsSum(context.supabase, w * 2);
      const prevOnly = {
        revenue: prev.revenue - cur.revenue,
        bookings: prev.bookings - cur.bookings,
        nights: prev.nights - cur.nights,
      };
      const push = async (metric: string, cv: number, pv: number) => {
        const delta = pct(cv, pv);
        const rec = {
          domain: "bookings", metric, window_days: w,
          current_value: cv, previous_value: pv, delta_pct: delta,
          direction: delta > 1 ? "up" : delta < -1 ? "down" : "flat",
          evidence: { window: w },
        };
        out.push(rec);
        await context.supabase.from("ai_trend_snapshots").insert(rec);
      };
      await push("revenue", cur.revenue, prevOnly.revenue);
      await push("bookings", cur.bookings, prevOnly.bookings);
      await push("room_nights", cur.nights, prevOnly.nights);
    }
    return { computed: out.length, snapshots: out };
  });

export const listTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_trend_snapshots").select("*").order("captured_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const generateAnalyticsRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: trends } = await context.supabase.from("ai_trend_snapshots").select("*").order("captured_at", { ascending: false }).limit(60);
    const created: any[] = [];
    for (const t of (trends ?? []) as Row[]) {
      const delta = Number(t.delta_pct ?? 0);
      if (Math.abs(delta) < 10) continue;
      const direction = delta > 0 ? "increased" : "decreased";
      const rec = {
        domain: t.domain,
        title: `${String(t.metric).replace(/_/g, " ")} ${direction} ${Math.round(Math.abs(delta))}% (${t.window_days}d)`,
        reasoning: `Trend snapshot shows ${t.metric} moved from ${t.previous_value ?? 0} to ${t.current_value ?? 0} in the last ${t.window_days} days.`,
        evidence: { trendId: t.id, current: t.current_value, previous: t.previous_value },
        confidence: Math.min(0.95, 0.5 + Math.abs(delta) / 200),
        impact: Math.abs(delta) > 25 ? "high" : "medium",
        suggested_action: delta > 0
          ? `Double down on channels driving this ${t.metric} uplift.`
          : `Investigate why ${t.metric} is declining and prioritise recovery actions.`,
        status: "open",
      };
      const { data: inserted } = await context.supabase.from("ai_analytics_recommendations").insert(rec).select().single();
      if (inserted) created.push(inserted);
    }
    return { created: created.length, recommendations: created };
  });

export const listAnalyticsRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("ai_analytics_recommendations").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });

export const setAnalyticsRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["open", "accepted", "dismissed", "resolved"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_analytics_recommendations")
      .update({ status: data.status, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
