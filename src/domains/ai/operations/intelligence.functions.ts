import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertRole(sb: any, userId: string, roles: string[]) {
  const { data, error } = await sb.rpc("has_any_role", { _user_id: userId, _roles: roles });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function log(sb: any, userId: string, tool: string, args: any = {}) {
  await sb.from("ai_activity_logs").insert({
    user_id: userId,
    tool_called: tool,
    tool_args: args,
    status: "ok",
  });
}

const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);

/* ============================================================
   MODULE 1 + 2 — Arrival Priority Engine & Room Readiness Insights
   ============================================================ */

/**
 * Compute today's arrival preparation priorities and persist any risks
 * as ai_room_readiness_insights (idempotent per booking+type+day).
 * AI SUGGESTS — housekeeping decides.
 */
export const generateRoomReadinessInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, context.userId, [
      "owner", "manager", "admin", "housekeeping", "reception", "reservations",
    ]);
    const sb: any = context.supabase;
    const day = isoDate();

    const [depRes, arrRes, prefRes] = await Promise.all([
      sb.from("bookings")
        .select("id, reference, guest_name, room_id, check_out, rooms(name)")
        .eq("check_out", day)
        .neq("status", "cancelled"),
      sb.from("bookings")
        .select("id, reference, guest_name, guest_type, guest_id, room_id, check_in, check_out, special_requests, rooms(name)")
        .eq("check_in", day)
        .neq("status", "cancelled"),
      sb.from("guest_preferences")
        .select("guest_id, preference_type, value, status")
        .eq("status", "approved")
        .limit(500),
    ]);
    const departures = depRes.data ?? [];
    const arrivals = arrRes.data ?? [];
    const prefs = prefRes.data ?? [];
    const prefByGuest = new Map<string, any[]>();
    for (const p of prefs) {
      const arr = prefByGuest.get(p.guest_id) ?? [];
      arr.push(p);
      prefByGuest.set(p.guest_id, arr);
    }

    const priorities: any[] = [];
    const upserts: any[] = [];

    for (const a of arrivals) {
      const sameDayDep = departures.find((d) => d.room_id === a.room_id);
      const isVip = a.guest_type && a.guest_type !== "standard";
      const guestPrefs = a.guest_id ? prefByGuest.get(a.guest_id) ?? [] : [];
      const hasSpecial = !!(a.special_requests && a.special_requests.trim().length > 3);

      let priorityLevel: "low" | "medium" | "high" | "critical" = "medium";
      let score = 0.5;
      const reasons: string[] = [];
      if (sameDayDep) { score += 0.2; reasons.push(`Same-day turnover (dep: ${sameDayDep.guest_name})`); }
      if (isVip) { score += 0.2; reasons.push(`Priority guest (${a.guest_type})`); }
      if (hasSpecial) { score += 0.1; reasons.push("Special requests on booking"); }
      if (guestPrefs.length) { score += 0.05; reasons.push(`${guestPrefs.length} approved preference(s)`); }

      if (score >= 0.85) priorityLevel = "critical";
      else if (score >= 0.7) priorityLevel = "high";
      else if (score >= 0.55) priorityLevel = "medium";
      else priorityLevel = "low";

      const rec = {
        priority: priorityLevel,
        room: a.rooms?.name ?? "Room",
        room_id: a.room_id,
        booking_id: a.id,
        guest: a.guest_name,
        reason: reasons.join(" • ") || "Standard arrival preparation",
        evidence: {
          same_day_departure: !!sameDayDep,
          is_priority_guest: !!isVip,
          has_special_requests: hasSpecial,
          approved_preferences: guestPrefs.length,
        },
        confidence: Math.min(0.95, score + 0.1),
      };
      priorities.push(rec);

      // Persist insights for high/critical
      if (priorityLevel === "high" || priorityLevel === "critical") {
        const insightType = sameDayDep ? "turnaround_pressure" : (hasSpecial || guestPrefs.length ? "special_preparation" : "arrival_risk");
        upserts.push({
          room_id: a.room_id,
          booking_id: a.id,
          insight_type: insightType,
          priority: priorityLevel,
          title: `${rec.room}: ${priorityLevel.toUpperCase()} arrival preparation`,
          reasoning: rec.reason,
          evidence: rec.evidence,
          confidence: rec.confidence,
          generated_by: context.userId,
        });
      }
    }

    // Idempotency: only insert if not already pending for the same booking + type today
    let inserted = 0;
    for (const row of upserts) {
      const { data: existing } = await sb
        .from("ai_room_readiness_insights")
        .select("id")
        .eq("booking_id", row.booking_id)
        .eq("insight_type", row.insight_type)
        .eq("status", "pending")
        .maybeSingle();
      if (!existing) {
        const { error } = await sb.from("ai_room_readiness_insights").insert(row);
        if (!error) inserted++;
      }
    }

    priorities.sort((a, b) => {
      const rank = { critical: 4, high: 3, medium: 2, low: 1 } as any;
      return rank[b.priority] - rank[a.priority];
    });

    await log(sb, context.userId, "operations.generate_room_readiness", { inserted, priorities: priorities.length });
    return { priorities, inserted };
  });

export const listRoomReadinessInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      status: z.enum(["pending", "approved", "dismissed", "converted_to_task", "all"]).default("pending"),
    }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_room_readiness_insights")
      .select("*, rooms(name, slug), bookings(reference, guest_name, check_in, check_out)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateRoomReadinessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "dismissed", "converted_to_task"]),
      notes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, [
      "owner", "manager", "admin", "reception", "reservations", "housekeeping",
    ]);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_room_readiness_insights")
      .update({
        status: data.status,
        notes: data.notes,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Optionally convert to ops task
    if (data.status === "converted_to_task" && row) {
      await sb.from("ops_tasks").insert({
        booking_id: row.booking_id,
        task_type: "room_prep",
        category: "housekeeping",
        title: row.title,
        description: row.reasoning,
        priority: row.priority === "critical" ? 1 : 2,
      });
    }
    await log(sb, context.userId, `operations.room_readiness_${data.status}`, { id: data.id });
    return row;
  });

/* ============================================================
   MODULE 3 — Maintenance Recurring-Issue Intelligence (expanded)
   ============================================================ */

export const getMaintenanceIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data, error } = await sb
      .from("ops_tasks")
      .select("id, title, description, status, priority, due_at, completed_at, created_at, booking_id, category, task_type")
      .or("category.eq.maintenance,task_type.eq.maintenance")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tasks = data ?? [];

    const buckets = new Map<string, any[]>();
    for (const t of tasks) {
      const key = String(t.title ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).slice(0, 4).join(" ");
      if (!key) continue;
      const arr = buckets.get(key) ?? [];
      arr.push(t);
      buckets.set(key, arr);
    }
    const recurring = [...buckets.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .map(([key, arr]) => {
        const avgResolveMs = arr
          .filter((t) => t.completed_at)
          .map((t) => new Date(t.completed_at).getTime() - new Date(t.created_at).getTime())
          .reduce((a: number, b: number, _i, xs) => a + b / xs.length, 0);
        return {
          pattern: key,
          occurrences: arr.length,
          sample_title: arr[0].title,
          avg_resolution_hours: avgResolveMs ? Math.round(avgResolveMs / 3600_000) : null,
          recommendation: `Occurred ${arr.length}× in 60 days — schedule preventive inspection.`,
          confidence: Math.min(0.95, 0.6 + arr.length * 0.08),
        };
      })
      .sort((a, b) => b.occurrences - a.occurrences);

    const delayed = tasks
      .filter((t) => t.status !== "completed" && t.due_at && new Date(t.due_at) < new Date())
      .map((t) => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at,
        overdue_days: Math.floor((Date.now() - new Date(t.due_at).getTime()) / 86400_000),
      }));

    // High-impact rooms (based on booking_id repetition)
    const roomHits = new Map<string, number>();
    for (const t of tasks) if (t.booking_id) roomHits.set(t.booking_id, (roomHits.get(t.booking_id) ?? 0) + 1);
    const highImpactBookings = [...roomHits.entries()]
      .filter(([, n]) => n >= 3)
      .map(([booking_id, count]) => ({ booking_id, count }));

    return { recurring, delayed, highImpactBookings, total: tasks.length };
  });

/* ============================================================
   MODULE 4 — Staff Operations Intelligence (non-personal)
   ============================================================ */

export const generateStaffOperationsInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();

    const { data: tasks } = await sb
      .from("ops_tasks")
      .select("id, category, task_type, status, priority, due_at, completed_at, created_at")
      .gte("created_at", since);

    const list = tasks ?? [];
    const total = list.length;
    const completed = list.filter((t) => t.status === "completed");
    const overdue = list.filter((t) => t.status !== "completed" && t.due_at && new Date(t.due_at) < new Date());

    const byCategory: Record<string, { total: number; completed: number; overdue: number }> = {};
    for (const t of list) {
      const c = String(t.category ?? t.task_type ?? "other");
      byCategory[c] = byCategory[c] ?? { total: 0, completed: 0, overdue: 0 };
      byCategory[c].total++;
      if (t.status === "completed") byCategory[c].completed++;
      if (t.status !== "completed" && t.due_at && new Date(t.due_at) < new Date()) byCategory[c].overdue++;
    }

    const insights: any[] = [];

    // Response-time signal
    const completedWithTimes = completed.filter((t) => t.completed_at && t.created_at);
    if (completedWithTimes.length >= 5) {
      const avgMs =
        completedWithTimes.reduce(
          (acc: number, t: any) => acc + (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()),
          0,
        ) / completedWithTimes.length;
      const avgHours = Math.round(avgMs / 3600_000);
      if (avgHours > 48) {
        insights.push({
          insight_type: "response_time",
          title: `Average task resolution: ${avgHours}h`,
          reasoning: "Average resolution time above 48h suggests process delay — not an individual concern.",
          evidence: { avg_hours: avgHours, sample: completedWithTimes.length },
          affected_area: "operations",
          recommendation: "Review triage workflow and task-assignment cadence.",
          confidence: 0.75,
          generated_by: context.userId,
        });
      }
    }

    // Workload imbalance across categories
    const catEntries = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);
    if (catEntries.length >= 2) {
      const top = catEntries[0];
      const bottom = catEntries[catEntries.length - 1];
      if (top[1].total >= bottom[1].total * 3 && top[1].total >= 10) {
        insights.push({
          insight_type: "workload_balance",
          title: `${top[0]} carries ${top[1].total} tasks (3× the lightest area)`,
          reasoning: "Uneven workload across operational categories may need resourcing review.",
          evidence: { distribution: byCategory },
          affected_area: top[0],
          recommendation: `Consider redistributing recurring ${top[0]} tasks or adding capacity.`,
          confidence: 0.7,
          generated_by: context.userId,
        });
      }
    }

    // Delayed tasks pattern
    if (total > 0 && overdue.length / Math.max(1, total) > 0.15) {
      insights.push({
        insight_type: "process_improvement",
        title: `${overdue.length} of ${total} tasks running overdue`,
        reasoning: "Over 15% of tasks are overdue — indicates a scheduling or capacity gap.",
        evidence: { overdue: overdue.length, total },
        affected_area: "task_scheduling",
        recommendation: "Introduce daily standup or reprioritisation checkpoint.",
        confidence: 0.72,
        generated_by: context.userId,
      });
    }

    let inserted = 0;
    for (const ins of insights) {
      const { data: existing } = await sb
        .from("ai_staff_operations_insights")
        .select("id")
        .eq("insight_type", ins.insight_type)
        .eq("status", "pending")
        .maybeSingle();
      if (!existing) {
        const { error } = await sb.from("ai_staff_operations_insights").insert(ins);
        if (!error) inserted++;
      }
    }

    await log(sb, context.userId, "operations.generate_staff_insights", { inserted });
    return { inserted, insights };
  });

export const listStaffOperationsInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ status: z.enum(["pending", "approved", "dismissed", "actioned", "all"]).default("pending") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    let q: any = context.supabase
      .from("ai_staff_operations_insights")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateStaffInsightStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "dismissed", "actioned"]),
      notes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_staff_operations_insights")
      .update({
        status: data.status,
        notes: data.notes,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await log(sb, context.userId, `operations.staff_insight_${data.status}`, { id: data.id });
    return row;
  });

/* ============================================================
   MODULE 5 — Service Recovery Intelligence
   ============================================================ */

export const generateServiceRecoveryInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, context.userId, [
      "owner", "manager", "admin", "reception", "reservations", "marketing",
    ]);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();

    const [escRes, revRes, stayRes, fbRes] = await Promise.all([
      sb.from("ai_escalations")
        .select("id, guest_id, reason, summary, priority, status, ai_confidence, created_at, session_id")
        .gte("created_at", since)
        .in("status", ["open", "pending", "in_progress"])
        .limit(50),
      sb.from("reviews")
        .select("id, guest_id, booking_id, rating, title, comment, source, created_at")
        .lte("rating", 3)
        .gte("created_at", since)
        .limit(50),
      sb.from("ai_stay_insights")
        .select("id, booking_id, insight_type, content, confidence, status, created_at")
        .in("insight_type", ["complaint", "risk", "issue"])
        .gte("created_at", since)
        .limit(50),
      sb.from("ai_concierge_feedback")
        .select("id, session_id, rating, comment, created_at")
        .in("rating", ["incorrect", "unhelpful", "bad"])
        .gte("created_at", since)
        .limit(50),
    ]);

    const upserts: any[] = [];
    for (const e of escRes.data ?? []) {
      upserts.push({
        guest_id: e.guest_id,
        signal_source: "concierge_escalation",
        source_ref: e.id,
        severity: e.priority && e.priority <= 1 ? "high" : e.priority && e.priority <= 2 ? "medium" : "low",
        title: `Escalation: ${(e.reason ?? "guest issue").slice(0, 80)}`,
        signal: e.summary ?? e.reason ?? "Concierge flagged this conversation.",
        recommendation: "Manager to follow up with guest within 24 hours.",
        evidence: { escalation_id: e.id, session_id: e.session_id, ai_confidence: e.ai_confidence },
        confidence: Number(e.ai_confidence ?? 0.75),
        generated_by: context.userId,
      });
    }
    for (const r of revRes.data ?? []) {
      upserts.push({
        guest_id: r.guest_id,
        booking_id: r.booking_id,
        signal_source: "review",
        source_ref: r.id,
        severity: r.rating <= 2 ? "high" : "medium",
        title: `Low review (${r.rating}/5) from ${r.source ?? "guest"}`,
        signal: r.comment ?? r.title ?? "Low rating recorded.",
        recommendation: "Draft personalised response and internal debrief with team.",
        evidence: { review_id: r.id, rating: r.rating, source: r.source },
        confidence: 0.85,
        generated_by: context.userId,
      });
    }
    for (const s of stayRes.data ?? []) {
      upserts.push({
        booking_id: s.booking_id,
        signal_source: "stay_insight",
        source_ref: s.id,
        severity: "medium",
        title: `Stay signal: ${s.insight_type}`,
        signal: s.content ?? "",
        recommendation: "Reach out during stay to recover experience.",
        evidence: { stay_insight_id: s.id, insight_type: s.insight_type },
        confidence: Number(s.confidence ?? 0.7),
        generated_by: context.userId,
      });
    }
    for (const f of fbRes.data ?? []) {
      upserts.push({
        signal_source: "guest_feedback",
        source_ref: f.id,
        severity: "low",
        title: `Concierge feedback: ${f.rating}`,
        signal: f.comment ?? "Guest marked concierge response unhelpful.",
        recommendation: "Review concierge answer quality; refine knowledge base.",
        evidence: { feedback_id: f.id, session_id: f.session_id, rating: f.rating },
        confidence: 0.65,
        generated_by: context.userId,
      });
    }

    let inserted = 0;
    for (const row of upserts) {
      const { data: existing } = await sb
        .from("ai_service_recovery_insights")
        .select("id")
        .eq("signal_source", row.signal_source)
        .eq("source_ref", row.source_ref)
        .maybeSingle();
      if (!existing) {
        const { error } = await sb.from("ai_service_recovery_insights").insert(row);
        if (!error) inserted++;
      }
    }
    await log(sb, context.userId, "operations.generate_service_recovery", { inserted });
    return { inserted, evaluated: upserts.length };
  });

export const listServiceRecoveryInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      status: z.enum(["pending", "approved", "dismissed", "converted_to_task", "resolved", "all"]).default("pending"),
    }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_service_recovery_insights")
      .select("*, bookings(reference, guest_name), guests(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateServiceRecoveryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "dismissed", "converted_to_task", "resolved"]),
      notes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, [
      "owner", "manager", "admin", "reception", "reservations", "marketing",
    ]);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_service_recovery_insights")
      .update({
        status: data.status,
        notes: data.notes,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (data.status === "converted_to_task" && row) {
      await sb.from("ops_tasks").insert({
        booking_id: row.booking_id,
        task_type: "service_recovery",
        category: "guest_relations",
        title: row.title,
        description: `${row.signal}\n\nRecommendation: ${row.recommendation}`,
        priority: row.severity === "critical" || row.severity === "high" ? 1 : 2,
      });
    }
    await log(sb, context.userId, `operations.service_recovery_${data.status}`, { id: data.id });
    return row;
  });

/* ============================================================
   MODULE 6 — Operational Pattern Detection
   ============================================================ */

export const generateOperationsPatterns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    const sb: any = context.supabase;
    const now = Date.now();
    const thirtyAgo = new Date(now - 30 * 86400_000).toISOString();
    const sixtyAgo = new Date(now - 60 * 86400_000).toISOString();

    const [recentComms, olderComms, recentTasks, olderTasks] = await Promise.all([
      sb.from("guest_communications").select("id, subject, body, occurred_at").gte("occurred_at", thirtyAgo).limit(1000),
      sb.from("guest_communications").select("id, subject, body, occurred_at").gte("occurred_at", sixtyAgo).lt("occurred_at", thirtyAgo).limit(1000),
      sb.from("ops_tasks").select("id, title, category, created_at").gte("created_at", thirtyAgo).limit(1000),
      sb.from("ops_tasks").select("id, title, category, created_at").gte("created_at", sixtyAgo).lt("created_at", thirtyAgo).limit(1000),
    ]);

    const patterns: any[] = [];
    const topics = [
      { key: "airport_transfer", label: "Airport transfer", terms: ["airport", "transfer", "shuttle", "pickup", "pick up"] },
      { key: "pool", label: "Pool", terms: ["pool", "swimming"] },
      { key: "wifi", label: "Wi-Fi", terms: ["wifi", "wi-fi", "internet", "connection"] },
      { key: "restaurant", label: "Restaurant / dining", terms: ["restaurant", "menu", "dining", "food"] },
      { key: "kilimanjaro", label: "Kilimanjaro / climbing", terms: ["kilimanjaro", "climb", "trek"] },
      { key: "safari", label: "Safari", terms: ["safari", "game drive", "serengeti", "ngorongoro"] },
    ];

    const countTopic = (rows: any[], terms: string[]) =>
      rows.filter((r) => {
        const t = (`${r.subject ?? ""} ${r.body ?? r.title ?? ""}`).toLowerCase();
        return terms.some((k) => t.includes(k));
      }).length;

    for (const topic of topics) {
      const recent = countTopic(recentComms.data ?? [], topic.terms);
      const older = countTopic(olderComms.data ?? [], topic.terms);
      if (recent < 3) continue;
      const delta = older > 0 ? (recent - older) / older : recent > 5 ? 1 : 0;
      if (delta >= 0.25) {
        patterns.push({
          pattern_type: "guest_request",
          title: `${topic.label} questions ${delta >= 1 ? "surging" : "increasing"} (+${Math.round(delta * 100)}%)`,
          description: `${recent} guest touchpoints referenced ${topic.label} in the last 30 days (vs ${older} in the prior 30).`,
          metric_change: Number((delta * 100).toFixed(1)),
          timeframe_days: 30,
          occurrences: recent,
          evidence: { recent_30d: recent, previous_30d: older, terms: topic.terms },
          recommendation: `Ensure knowledge base + concierge script covers ${topic.label} thoroughly.`,
          confidence: Math.min(0.9, 0.5 + delta * 0.3),
          generated_by: context.userId,
        });
      }
    }

    // Category-level task pressure
    const catCount = (rows: any[]) => {
      const m = new Map<string, number>();
      for (const t of rows) {
        const c = String(t.category ?? "other");
        m.set(c, (m.get(c) ?? 0) + 1);
      }
      return m;
    };
    const recentCat = catCount(recentTasks.data ?? []);
    const olderCat = catCount(olderTasks.data ?? []);
    for (const [cat, r] of recentCat) {
      if (r < 5) continue;
      const o = olderCat.get(cat) ?? 0;
      const delta = o > 0 ? (r - o) / o : r > 10 ? 1 : 0;
      if (delta >= 0.4) {
        patterns.push({
          pattern_type: "seasonal_pressure",
          title: `${cat} task volume up ${Math.round(delta * 100)}%`,
          description: `${r} ${cat} tasks in the last 30 days (vs ${o}).`,
          metric_change: Number((delta * 100).toFixed(1)),
          timeframe_days: 30,
          occurrences: r,
          evidence: { category: cat, recent: r, previous: o },
          recommendation: `Plan capacity or preventive maintenance for ${cat}.`,
          confidence: 0.7,
          generated_by: context.userId,
        });
      }
    }

    let inserted = 0;
    for (const p of patterns) {
      const { data: existing } = await sb
        .from("ai_operations_patterns")
        .select("id")
        .eq("title", p.title)
        .eq("status", "pending")
        .maybeSingle();
      if (!existing) {
        const { error } = await sb.from("ai_operations_patterns").insert(p);
        if (!error) inserted++;
      }
    }
    await log(sb, context.userId, "operations.generate_patterns", { inserted, evaluated: patterns.length });
    return { inserted, patterns };
  });

export const listOperationsPatterns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ status: z.enum(["pending", "approved", "dismissed", "actioned", "all"]).default("pending") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_operations_patterns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updatePatternStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "dismissed", "actioned"]),
      notes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_operations_patterns")
      .update({
        status: data.status,
        notes: data.notes,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await log(sb, context.userId, `operations.pattern_${data.status}`, { id: data.id });
    return row;
  });

/* ============================================================
   MODULE 7 — Operational Pressure Dashboard summary
   ============================================================ */

export const getOperationsPressureSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const day = isoDate();
    const [arr, dep, tasks, readiness, recovery, patterns, staff] = await Promise.all([
      sb.from("bookings").select("id", { count: "exact", head: true }).eq("check_in", day).neq("status", "cancelled"),
      sb.from("bookings").select("id", { count: "exact", head: true }).eq("check_out", day).neq("status", "cancelled"),
      sb.from("ops_tasks").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"]),
      sb.from("ai_room_readiness_insights").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("ai_service_recovery_insights").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("ai_operations_patterns").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("ai_staff_operations_insights").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    return {
      arrivals: arr.count ?? 0,
      departures: dep.count ?? 0,
      open_tasks: tasks.count ?? 0,
      readiness_pending: readiness.count ?? 0,
      recovery_pending: recovery.count ?? 0,
      patterns_pending: patterns.count ?? 0,
      staff_pending: staff.count ?? 0,
      pending_reviews:
        (readiness.count ?? 0) + (recovery.count ?? 0) + (patterns.count ?? 0) + (staff.count ?? 0),
    };
  });