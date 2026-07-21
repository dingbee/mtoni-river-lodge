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

const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Generate today's operations briefing. AI SUGGESTS — never mutates rooms, tasks,
 * bookings, or guest communications.
 */
export const generateOperationsBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ date: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    const sb: any = context.supabase;
    const day = data.date ?? isoDate();

    const [arrivalsRes, departuresRes, tasksRes, alertsRes] = await Promise.all([
      sb
        .from("bookings")
        .select("id, reference, guest_name, guest_type, adults, children, check_in, check_out, special_requests")
        .eq("check_in", day)
        .neq("status", "cancelled"),
      sb
        .from("bookings")
        .select("id, reference, guest_name, check_in, check_out")
        .eq("check_out", day)
        .neq("status", "cancelled"),
      sb
        .from("ops_tasks")
        .select("id, title, category, priority, status, due_at")
        .in("status", ["pending", "in_progress"])
        .order("priority", { ascending: true })
        .limit(50),
      sb
        .from("ops_alerts")
        .select("id, kind, severity, message, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const arrivals = arrivalsRes.data ?? [];
    const departures = departuresRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const alerts = alertsRes.data ?? [];

    const vipArrivals = arrivals.filter((b) => b.guest_type && b.guest_type !== "standard");
    const overdueTasks = tasks.filter(
      (t) => t.due_at && new Date(t.due_at).getTime() < Date.now(),
    );
    const highPriorityTasks = tasks.filter((t) => t.priority === 1);

    const priorities: unknown[] = [];
    if (vipArrivals.length) {
      priorities.push({
        title: `${vipArrivals.length} priority arrival(s) today`,
        detail: vipArrivals.map((v) => `${v.guest_name} (${v.guest_type})`).join("; "),
        impact: "high",
      });
    }
    if (departures.length && arrivals.length) {
      priorities.push({
        title: `${departures.length} turnover(s) with same-day arrivals`,
        detail: "Coordinate housekeeping between check-out and check-in windows.",
        impact: "high",
      });
    }
    if (highPriorityTasks.length) {
      priorities.push({
        title: `${highPriorityTasks.length} P1 task(s) open`,
        detail: highPriorityTasks.slice(0, 3).map((t) => t.title).join("; "),
        impact: "medium",
      });
    }

    const risks: unknown[] = [];
    if (overdueTasks.length) {
      risks.push({
        title: `${overdueTasks.length} overdue task(s)`,
        detail: overdueTasks.slice(0, 3).map((t) => t.title).join("; "),
        severity: "medium",
      });
    }
    if (alerts.filter((a) => a.severity === "high").length) {
      risks.push({
        title: "Open high-severity operational alerts",
        detail: `${alerts.filter((a) => a.severity === "high").length} alert(s)`,
        severity: "high",
      });
    }

    const recommendations: unknown[] = [];
    if (vipArrivals.length) {
      recommendations.push({
        title: "Brief reception on priority arrivals",
        reasoning: "Priority guests benefit from a personalised welcome and prepared room.",
      });
    }
    if (departures.length && arrivals.length) {
      recommendations.push({
        title: "Sequence housekeeping by arrival time",
        reasoning: "Match cleaning order to arrival ETAs to avoid delays at check-in.",
      });
    }
    if (overdueTasks.length >= 3) {
      recommendations.push({
        title: "Redistribute overdue tasks",
        reasoning: "Backlog is growing — reassign or escalate to prevent guest impact.",
      });
    }

    const summary =
      `Karibu Mtoni Team. Today: ${arrivals.length} arrival(s), ${departures.length} departure(s), ` +
      `${tasks.length} open task(s), ${alerts.length} alert(s). ` +
      (priorities.length ? `${priorities.length} priority item(s) flagged.` : "No critical priorities.");

    const evidence = {
      counts: {
        arrivals: arrivals.length,
        departures: departures.length,
        open_tasks: tasks.length,
        overdue_tasks: overdueTasks.length,
        alerts: alerts.length,
        vip_arrivals: vipArrivals.length,
      },
      sample: {
        arrivals: arrivals.slice(0, 5),
        departures: departures.slice(0, 5),
      },
    };

    const { data: row, error } = await sb
      .from("ai_operations_briefings")
      .insert({
        briefing_date: day,
        summary,
        priorities,
        risks,
        recommendations,
        evidence,
        metrics: evidence.counts,
        generated_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "operations.generate_briefing",
      tool_args: { date: day },
      status: "ok",
    });

    return row;
  });

export const listOperationsBriefings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(60).default(14) }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("ai_operations_briefings")
      .select("*")
      .order("briefing_date", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTodaysArrivals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const day = isoDate();
    const { data, error } = await context.supabase
      .from("bookings")
      .select(
        "id, reference, guest_name, guest_email, guest_phone, guest_type, adults, children, check_in, check_out, special_requests, visit_purpose, room_id",
      )
      .eq("check_in", day)
      .neq("status", "cancelled")
      .order("guest_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Housekeeping intelligence — suggests priority ordering for today's turnovers.
 * AI SUGGESTS — housekeeping controls execution.
 */
export const getHousekeepingPriorities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const day = isoDate();
    const sb: any = context.supabase;
    const [depRes, arrRes] = await Promise.all([
      sb
        .from("bookings")
        .select("id, reference, guest_name, room_id, check_out, rooms(name, slug)")
        .eq("check_out", day)
        .neq("status", "cancelled"),
      sb
        .from("bookings")
        .select("id, reference, guest_name, guest_type, room_id, check_in, rooms(name, slug)")
        .eq("check_in", day)
        .neq("status", "cancelled"),
    ]);
    const departures = depRes.data ?? [];
    const arrivals = arrRes.data ?? [];

    const priorities = departures.map((d) => {
      const nextArrival = arrivals.find((a) => a.room_id === d.room_id);
      const isVip = nextArrival?.guest_type && nextArrival.guest_type !== "standard";
      let score = 40;
      if (nextArrival) score += 40;
      if (isVip) score += 20;
      return {
        booking_id: d.id,
        room_id: d.room_id,
        room_name: d.rooms?.name ?? "Room",
        departure_guest: d.guest_name,
        next_arrival: nextArrival
          ? { guest_name: nextArrival.guest_name, is_priority: !!isVip }
          : null,
        score,
        reasoning: [
          `Departure on ${d.check_out}`,
          nextArrival ? `Same-day arrival: ${nextArrival.guest_name}` : "No same-day arrival",
          isVip ? "Priority guest indicator" : null,
        ]
          .filter(Boolean)
          .join(" • "),
      };
    });
    priorities.sort((a: Record<string, unknown>, b: Record<string, unknown>) => b.score - a.score);
    return priorities;
  });

/**
 * Maintenance intelligence — detects repeated or delayed maintenance tasks.
 */
export const getMaintenanceInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("ops_tasks")
      .select("id, title, description, status, priority, due_at, completed_at, created_at, booking_id")
      .eq("category", "maintenance")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tasks = data ?? [];

    // Repeated issues by normalised title
    const buckets = new Map<string, unknown[]>();
    for (const t of tasks) {
      const key = String(t.title ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").slice(0, 40);
      if (!key) continue;
      const arr = buckets.get(key) ?? [];
      arr.push(t);
      buckets.set(key, arr);
    }
    const repeated = [...buckets.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .map(([key, arr]) => ({
        pattern: key,
        occurrences: arr.length,
        sample_title: arr[0].title,
        recommendation: `Investigate root cause — recurred ${arr.length} time(s) in 60 days.`,
      }));

    const delayed = tasks
      .filter((t) => t.status !== "completed" && t.due_at && new Date(t.due_at) < new Date())
      .map((t) => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at,
        overdue_days: Math.floor((Date.now() - new Date(t.due_at).getTime()) / 86400_000),
      }));

    return { repeated, delayed, total: tasks.length };
  });

/**
 * Task intelligence — surfaces overdue, high-impact, and bottlenecked tasks.
 */
export const getTaskIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ops_tasks")
      .select("id, title, category, priority, status, due_at, created_at, booking_id")
      .in("status", ["pending", "in_progress"])
      .order("priority", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const tasks = data ?? [];
    const now = Date.now();
    const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
    const highImpact = tasks.filter((t) => t.priority === 1);
    const byCategory: Record<string, number> = {};
    for (const t of tasks) {
      const cat = String((t as any).category ?? "other");
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
    const bottleneck = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, open: count }));
    return { overdue, highImpact, bottleneck, total: tasks.length };
  });

/**
 * Operations alerts CRUD (list + update status).
 */
export const listOperationsAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ status: z.enum(["open", "acknowledged", "resolved", "dismissed", "all"]).default("open") })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_operations_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateOperationsAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "acknowledged", "resolved", "dismissed"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertRole(context.supabase, context.userId, [
      "owner",
      "manager",
      "admin",
      "reservations",
      "reception",
      "housekeeping",
    ]);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_operations_alerts")
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
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: `operations.alert_${data.status}`,
      tool_args: { id: data.id },
      status: "ok",
    });
    return row;
  });

/**
 * Compute and persist ops alerts from live signals. Idempotent per (type, key, open).
 */
export const detectOperationsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, context.userId, ["owner", "manager", "admin"]);
    const sb: any = context.supabase;
    const now = new Date();
    const created: unknown[] = [];

    const { data: overdue } = await sb
      .from("ops_tasks")
      .select("id, title, due_at")
      .in("status", ["pending", "in_progress"])
      .lt("due_at", now.toISOString())
      .limit(50);

    if ((overdue?.length ?? 0) >= 5) {
      const evidence = { overdue_count: overdue!.length };
      const { data: existing } = await sb
        .from("ai_operations_alerts")
        .select("id")
        .eq("alert_type", "task_backlog")
        .eq("status", "open")
        .maybeSingle();
      if (!existing) {
        const { data: row } = await sb
          .from("ai_operations_alerts")
          .insert({
            alert_type: "task_backlog",
            severity: "medium",
            title: `${overdue!.length} overdue task(s)`,
            reasoning: "Overdue task volume exceeds threshold — reallocate or escalate.",
            evidence,
            confidence: 0.9,
            recommended_action: "Reassign overdue items to available staff or reprioritise.",
          })
          .select("*")
          .single();
        if (row) created.push(row);
      }
    }

    const day = isoDate(now);
    const { data: sameDay } = await sb
      .from("bookings")
      .select("id, room_id")
      .or(`check_in.eq.${day},check_out.eq.${day}`)
      .neq("status", "cancelled");
    const rooms = new Map<string, { arr: number; dep: number }>();
    for (const b of sameDay ?? []) {
      if (!b.room_id) continue;
      const r = rooms.get(b.room_id) ?? { arr: 0, dep: 0 };
      rooms.set(b.room_id, r);
    }

    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "operations.detect_alerts",
      tool_args: { created: created.length },
      status: "ok",
    });
    return { created: created.length };
  });

export const listOperationsInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ status: z.enum(["pending", "accepted", "dismissed", "all"]).default("pending") })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_operations_insights")
      .select("*")
      .order("impact_score", { ascending: false, nullsFirst: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Timeline of operations AI activity.
 */
export const getOperationsTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const since = new Date(Date.now() - 3 * 86400_000).toISOString();
    const { data, error } = await context.supabase
      .from("ai_activity_logs")
      .select("id, tool_called, tool_args, status, created_at")
      .like("tool_called", "operations.%")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Staff knowledge assistant — searches approved knowledge base with citations.
 */
export const askOperationsKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ query: z.string().min(3).max(300) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: results, error } = await sb.rpc("knowledge_search", {
      _query: data.query,
      _limit: 5,
    });
    if (error) throw new Error(error.message);
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "operations.knowledge_search",
      tool_args: { query: data.query },
      status: "ok",
    });
    return results ?? [];
  });