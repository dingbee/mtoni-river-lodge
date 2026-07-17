// Admin-only server functions for the System Health dashboard.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOwnerOrAdmin(supabase: any, userId: string): Promise<void> {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: ["owner", "manager", "admin"],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId);

    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const since1h = new Date(Date.now() - 60 * 60_000).toISOString();

    const [latestProbes, unresolvedErrors, errors24h, errors1h, scheduledJobs, dlq] = await Promise.all([
      context.supabase
        .from("system_health_probes")
        .select("probe_name,status,latency_ms,details,checked_at")
        .order("checked_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("system_errors")
        .select("id", { count: "exact", head: true })
        .eq("resolved", false),
      context.supabase
        .from("system_errors")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", since24h),
      context.supabase
        .from("system_errors")
        .select("id", { count: "exact", head: true })
        .gte("occurred_at", since1h),
      context.supabase
        .from("scheduled_jobs")
        .select("id,name,status,last_run_at,next_run_at,last_error")
        .order("last_run_at", { ascending: false, nullsFirst: false })
        .limit(20),
      context.supabase
        .from("email_send_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "dlq"),
    ]);

    // Group latest probes by name
    const latestByProbe = new Map<string, { name: string; status: string; latency_ms: number | null; checked_at: string }>();
    for (const row of latestProbes.data ?? []) {
      if (!latestByProbe.has(row.probe_name)) {
        latestByProbe.set(row.probe_name, {
          name: row.probe_name,
          status: row.status,
          latency_ms: row.latency_ms,
          checked_at: row.checked_at,
        });
      }
    }

    return {
      probes: Array.from(latestByProbe.values()),
      errors: {
        unresolved: unresolvedErrors.count ?? 0,
        last_24h: errors24h.count ?? 0,
        last_1h: errors1h.count ?? 0,
      },
      scheduled_jobs: scheduledJobs.data ?? [],
      email_dlq_count: dlq.count ?? 0,
    };
  });

export const listSystemErrors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { resolved?: boolean; limit?: number }) => d)
  .handler(async ({ context, data }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId);
    const limit = Math.min(Math.max(data.limit ?? 50, 1), 200);
    let q = context.supabase
      .from("system_errors")
      .select("id,occurred_at,severity,source,module,function_name,message,resolved,request_id,user_id")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (typeof data.resolved === "boolean") q = q.eq("resolved", data.resolved);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resolveSystemError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("system_errors")
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });