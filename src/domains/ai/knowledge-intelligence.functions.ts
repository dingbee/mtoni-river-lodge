import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MANAGER_ROLES = ["owner", "manager", "admin"] as const;

const DEFAULT_FRESHNESS: Record<string, number> = {
  journal_article: 90,
  policy: 180,
  room: 30,
  experience: 60,
  website_page: 30,
  document: 180,
  other: 180,
};

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertManager(sb: any, userId: string) {
  const { data, error } = await sb.rpc("has_any_role", {
    _user_id: userId,
    _roles: [...MANAGER_ROLES],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

function daysBetween(a: string | null | undefined, b: Date = new Date()) {
  if (!a) return Infinity;
  return Math.max(0, Math.floor((b.getTime() - new Date(a).getTime()) / 86400_000));
}

function freshnessBucket(days: number, warning: number) {
  if (days <= warning * 0.5) return "fresh";
  if (days <= warning) return "needs_review";
  if (days <= warning * 2) return "stale";
  return "outdated";
}

// ---------- Scheduler config ----------
export const getSchedulerConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("ai_knowledge_scheduler_config").select("*").eq("id", 1).single();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateSchedulerConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({
      enabled: z.boolean().optional(),
      cron_expression: z.string().min(3).max(100).optional(),
      tasks: z.array(z.enum(["journal", "cms", "rooms"])).optional(),
      freshness_rules: z.record(z.string(), z.number().int().min(1).max(3650)).optional(),
      confidence_threshold: z.number().min(0).max(1).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertManager(context.supabase, context.userId);
    const patch: any = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.cron_expression) patch.cron_expression = data.cron_expression;
    if (data.tasks) patch.tasks = data.tasks;
    if (data.freshness_rules) patch.freshness_rules = data.freshness_rules;
    if (data.confidence_threshold !== undefined) patch.confidence_threshold = data.confidence_threshold;
    const { data: row, error } = await (context.supabase as any)
      .from("ai_knowledge_scheduler_config").update(patch).eq("id", 1).select().single();
    if (error) throw new Error(error.message);
    await (context.supabase as any).from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "knowledge_intel.update_scheduler",
      tool_args: patch,
      status: "ok",
    });
    return row;
  });

// ---------- Health ----------
export const getKnowledgeHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;

    const { data: sources } = await sb
      .from("ai_knowledge_sources")
      .select("id, source_type, status, last_synced_at, updated_at, source_updated_at, indexed_at, quality_score")
      .limit(5000);
    const rows = (sources ?? []) as any[];

    const { data: cfg } = await sb.from("ai_knowledge_scheduler_config").select("*").eq("id", 1).single();
    const rules: Record<string, number> = { ...DEFAULT_FRESHNESS, ...(cfg?.freshness_rules ?? {}) };

    const approved = rows.filter((r: any) => r.status === "approved");
    const pending = rows.filter((r: any) => r.status === "pending" || r.status === "processing");
    const archived = rows.filter((r: any) => r.status === "archived");
    const failed = rows.filter((r: any) => r.status === "failed");

    let staleCount = 0;
    let ageSum = 0;
    for (const r of approved) {
      const days = daysBetween(r.source_updated_at ?? r.last_synced_at ?? r.updated_at);
      ageSum += Number.isFinite(days) ? days : 0;
      const warn = rules[r.source_type] ?? 180;
      if (days > warn) staleCount++;
    }
    const avgAge = approved.length ? Math.round(ageSum / approved.length) : 0;
    const qualityAvg =
      approved.length && approved.some((r: any) => r.quality_score != null)
        ? approved.reduce((a: any, r: any) => a + (Number(r.quality_score) || 0), 0) / approved.length
        : null;

    // Health score: weighted composite
    const stalePct = approved.length ? staleCount / approved.length : 0;
    const failPct = rows.length ? failed.length / rows.length : 0;
    const pendingPct = rows.length ? pending.length / rows.length : 0;
    const healthScore = Math.max(
      0,
      Math.min(1, 1 - stalePct * 0.4 - failPct * 0.4 - pendingPct * 0.2),
    );

    const { data: lastRun } = await sb
      .from("ai_knowledge_sync_runs")
      .select("started_at, finished_at, status, error")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      healthScore,
      qualityAvg,
      totals: {
        total: rows.length,
        approved: approved.length,
        pending: pending.length,
        archived: archived.length,
        failed: failed.length,
        stale: staleCount,
      },
      averageAgeDays: avgAge,
      lastRun: lastRun ?? null,
      confidenceThreshold: Number(cfg?.confidence_threshold ?? 0.6),
    };
  });

// ---------- Freshness list ----------
export const getFreshnessReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: cfg } = await sb.from("ai_knowledge_scheduler_config").select("freshness_rules").eq("id", 1).single();
    const rules: Record<string, number> = { ...DEFAULT_FRESHNESS, ...(cfg?.freshness_rules ?? {}) };

    const { data: sources } = await sb
      .from("ai_knowledge_sources")
      .select("id, source_type, title, url, status, last_synced_at, updated_at, source_updated_at, quality_score")
      .eq("status", "approved")
      .limit(2000);

    const rows = ((sources ?? []) as any[]).map((r: any) => {
      const days = daysBetween(r.source_updated_at ?? r.last_synced_at ?? r.updated_at);
      const warn = rules[r.source_type] ?? 180;
      return {
        id: r.id,
        title: r.title,
        source_type: r.source_type,
        url: r.url,
        age_days: Number.isFinite(days) ? days : null,
        warning_days: warn,
        bucket: freshnessBucket(days, warn),
        quality_score: r.quality_score,
      };
    });

    const summary = rows.reduce(
      (acc, r) => {
        acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
        return acc;
      },
      { fresh: 0, needs_review: 0, stale: 0, outdated: 0 } as Record<string, number>,
    );
    return { rows, summary, rules };
  });

// ---------- Gaps ----------
export const getKnowledgeGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data: logs } = await sb
      .from("ai_knowledge_search_log")
      .select("query, result_count, confidence, created_at")
      .gte("created_at", since)
      .limit(5000);
    const rows = (logs ?? []) as any[];
    const grouped: Record<string, { count: number; avgConfidence: number; noResult: number }> = {};
    for (const r of rows) {
      const q = (r.query ?? "").trim().toLowerCase();
      if (!q) continue;
      const g = (grouped[q] = grouped[q] ?? { count: 0, avgConfidence: 0, noResult: 0 });
      g.count++;
      g.avgConfidence += Number(r.confidence) || 0;
      if ((r.result_count ?? 0) === 0) g.noResult++;
    }
    const items = Object.entries(grouped)
      .map(([query, g]) => ({
        query,
        asked: g.count,
        confidence: g.count ? g.avgConfidence / g.count : 0,
        no_result: g.noResult,
      }))
      .filter((r: any) => r.no_result > 0 || r.confidence < 0.6 || r.asked >= 3)
      .sort((a: any, b: any) => b.asked - a.asked)
      .slice(0, 50);
    return { gaps: items, totalQueries: rows.length };
  });

// ---------- Coverage ----------
export const getKnowledgeCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: sources } = await sb
      .from("ai_knowledge_sources")
      .select("source_type, status, source_updated_at, last_synced_at, updated_at")
      .limit(5000);
    const rows = (sources ?? []) as any[];
    const map: Record<string, { total: number; approved: number; freshest: string | null }> = {};
    for (const r of rows) {
      const t = r.source_type as string;
      const m = (map[t] = map[t] ?? { total: 0, approved: 0, freshest: null });
      m.total++;
      if (r.status === "approved") m.approved++;
      const last = r.source_updated_at ?? r.last_synced_at ?? r.updated_at;
      if (last && (!m.freshest || last > m.freshest)) m.freshest = last;
    }
    return Object.entries(map).map(([source_type, v]) => ({
      source_type,
      total: v.total,
      approved: v.approved,
      coverage: v.total ? v.approved / v.total : 0,
      last_updated: v.freshest,
    }));
  });

// ---------- Recommendations (derived from gaps) ----------
export const getContentRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data: logs } = await sb
      .from("ai_knowledge_search_log")
      .select("query, result_count, confidence")
      .gte("created_at", since)
      .limit(5000);
    const grouped: Record<string, { asked: number; noResult: number; confSum: number }> = {};
    for (const r of (logs ?? []) as any[]) {
      const q = (r.query ?? "").trim().toLowerCase();
      if (!q) continue;
      const g = (grouped[q] = grouped[q] ?? { asked: 0, noResult: 0, confSum: 0 });
      g.asked++;
      g.confSum += Number(r.confidence) || 0;
      if ((r.result_count ?? 0) === 0) g.noResult++;
    }
    const recs = Object.entries(grouped)
      .map(([q, g]) => {
        const conf = g.asked ? g.confSum / g.asked : 0;
        const failRate = g.asked ? g.noResult / g.asked : 0;
        const priority: "high" | "medium" | "low" =
          g.asked >= 10 && failRate > 0.5 ? "high" : g.asked >= 5 || conf < 0.4 ? "medium" : "low";
        const suggested_type = /price|cost|rate|fee/.test(q)
          ? "policy"
          : /journal|blog|article|story/.test(q)
            ? "journal_article"
            : /room|suite|accommodation/.test(q)
              ? "room"
              : /experience|activity|tour|climb|kili/.test(q)
                ? "experience"
                : "faq";
        return { query: q, asked: g.asked, no_result: g.noResult, confidence: conf, priority, suggested_type };
      })
      .filter((r: any) => r.priority !== "low" || r.no_result > 0)
      .sort((a: any, b: any) => {
        const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return rank[b.priority] - rank[a.priority] || b.asked - a.asked;
      })
      .slice(0, 30);
    return recs;
  });

// ---------- Source quality ----------
export const getSourceQualityList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rows } = await sb
      .from("ai_knowledge_sources")
      .select("id, title, source_type, url, status, completeness_score, freshness_score, usage_score, confidence_score, quality_score, usage_count, last_used_at, last_synced_at, source_updated_at, updated_at, content")
      .order("quality_score", { ascending: true, nullsFirst: true })
      .limit(data.limit);
    return (rows ?? []).map((r: any) => ({ ...r, content: undefined, content_length: (r.content ?? "").length }));
  });

// Recompute quality scores based on freshness/usage/completeness heuristics
export const recomputeQualityScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: cfg } = await sb.from("ai_knowledge_scheduler_config").select("freshness_rules").eq("id", 1).single();
    const rules: Record<string, number> = { ...DEFAULT_FRESHNESS, ...(cfg?.freshness_rules ?? {}) };
    const { data: rows } = await sb
      .from("ai_knowledge_sources")
      .select("id, source_type, content, summary, usage_count, last_synced_at, source_updated_at, updated_at")
      .eq("status", "approved")
      .limit(5000);

    const maxUsage = Math.max(1, ...((rows ?? []) as any[]).map((r: any) => r.usage_count ?? 0));
    let updated = 0;
    for (const r of (rows ?? []) as any[]) {
      const contentLen = (r.content ?? "").length;
      const completeness = Math.min(1, contentLen / 1500) * 0.7 + (r.summary ? 0.3 : 0);
      const days = daysBetween(r.source_updated_at ?? r.last_synced_at ?? r.updated_at);
      const warn = rules[r.source_type] ?? 180;
      const freshness = Math.max(0, Math.min(1, 1 - days / (warn * 2)));
      const usage = Math.min(1, (r.usage_count ?? 0) / maxUsage);
      const confidence = 0.5 + freshness * 0.3 + completeness * 0.2;
      const overall = completeness * 0.35 + freshness * 0.35 + usage * 0.15 + confidence * 0.15;
      await sb.from("ai_knowledge_sources").update({
        completeness_score: Number(completeness.toFixed(3)),
        freshness_score: Number(freshness.toFixed(3)),
        usage_score: Number(usage.toFixed(3)),
        confidence_score: Number(Math.min(1, confidence).toFixed(3)),
        quality_score: Number(overall.toFixed(3)),
      }).eq("id", r.id);
      updated++;
    }
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "knowledge_intel.recompute_quality",
      tool_args: { updated },
      status: "ok",
    });
    return { updated };
  });

// ---------- Notifications ----------
export const listKnowledgeNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({ status: z.enum(["open", "dismissed", "all"]).default("open") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    let q: any = (context.supabase as any)
      .from("ai_knowledge_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const dismissKnowledgeNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertManager(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("ai_knowledge_notifications")
      .update({ status: "dismissed", resolved_by: context.userId, resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Sync runs listing ----------
export const listSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("ai_knowledge_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Manual trigger (uses managed sync via existing functions) ----------
export const triggerScheduledSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.supabase, context.userId);
    const { runKnowledgeSyncJob } = await import("./knowledge-intelligence.server");
    const result = await runKnowledgeSyncJob({ triggeredBy: `user:${context.userId}` });
    return result;
  });