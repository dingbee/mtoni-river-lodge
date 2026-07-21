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
        .select("id,name,last_status,last_run_at,next_run_at,last_error,enabled")
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

// ---------------------------------------------------------------- Inventory Integrity
//
// Read-only cross-check between rooms.total_units (configured inventory) and
// public.room_states (physical units surfaced on the Operations Room Board).
// Detects drift like the recent Family/Deluxe/Standard mismatch. Never writes.

export type InventoryIntegrityRow = {
  room_id: string;
  slug: string;
  name: string;
  configured: number;
  physical: number;
  status: "synced" | "mismatch";
  delta: number;
  recommendation: string | null;
};

export type InventoryIntegrityReport = {
  rows: InventoryIntegrityRow[];
  configured_total: number;
  physical_total: number;
  mismatches: number;
  status: "synced" | "mismatch";
  checked_at: string;
};

export const getInventoryIntegrity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InventoryIntegrityReport> => {
    await assertOwnerOrAdmin(context.supabase, context.userId);

    const [roomsRes, statesRes] = await Promise.all([
      context.supabase
        .from("rooms")
        .select("id, slug, name, total_units, sort_order")
        .eq("status", "active"),
      context.supabase.from("room_states").select("room_id"),
    ]);
    if (roomsRes.error) throw new Error(roomsRes.error.message);
    if (statesRes.error) throw new Error(statesRes.error.message);

    const counts = new Map<string, number>();
    for (const s of (statesRes.data ?? []) as Array<{ room_id: string }>) {
      counts.set(s.room_id, (counts.get(s.room_id) ?? 0) + 1);
    }

    const rows: InventoryIntegrityRow[] = ((roomsRes.data ?? []) as Array<{
      id: string; slug: string; name: string; total_units: number; sort_order: number | null;
    }>)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((r) => {
        const configured = Number(r.total_units ?? 0);
        const physical = counts.get(r.id) ?? 0;
        const delta = physical - configured;
        const synced = delta === 0;
        return {
          room_id: r.id,
          slug: r.slug,
          name: r.name,
          configured,
          physical,
          delta,
          status: synced ? "synced" : "mismatch",
          recommendation: synced
            ? null
            : delta > 0
              ? `Remove ${delta} extra physical unit${delta === 1 ? "" : "s"} from room_states for ${r.name}.`
              : `Add ${Math.abs(delta)} physical unit${Math.abs(delta) === 1 ? "" : "s"} to room_states for ${r.name}.`,
        };
      });

    const configured_total = rows.reduce((n, r) => n + r.configured, 0);
    const physical_total = rows.reduce((n, r) => n + r.physical, 0);
    const mismatches = rows.filter((r) => r.status === "mismatch").length;

    return {
      rows,
      configured_total,
      physical_total,
      mismatches,
      status: mismatches === 0 ? "synced" : "mismatch",
      checked_at: new Date().toISOString(),
    };
  });