// Public health probe endpoint.
// External uptime monitors (UptimeRobot, Pingdom, cron-job.org) can hit this.
// Reports database reachability, AI Gateway key presence, and email queue depth.
// Records each check into `system_health_probes` for the admin System Health dashboard.

import { createFileRoute } from "@tanstack/react-router";

type ProbeStatus = "ok" | "degraded" | "down";

interface Probe {
  name: string;
  status: ProbeStatus;
  latency_ms: number;
  details: Record<string, unknown>;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; error: unknown; latency_ms: number }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { result, error: null, latency_ms: Date.now() - t0 };
  } catch (error) {
    return { result: null, error, latency_ms: Date.now() - t0 };
  }
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const probes: Probe[] = [];

        // 1. Database round-trip
        const db = await timed(async () => {
          const { error } = await supabaseAdmin.from("rooms").select("id", { count: "exact", head: true }).limit(1);
          if (error) throw new Error(error.message);
          return true;
        });
        probes.push({
          name: "database",
          status: db.error ? "down" : db.latency_ms > 1500 ? "degraded" : "ok",
          latency_ms: db.latency_ms,
          details: db.error ? { error: (db.error as Error).message } : {},
        });

        // 2. AI Gateway configuration
        const aiKey = process.env.LOVABLE_API_KEY;
        probes.push({
          name: "ai_gateway",
          status: aiKey ? "ok" : "down",
          latency_ms: 0,
          details: { configured: Boolean(aiKey) },
        });

        // 3. Email queue depth (via pgmq metadata)
        const eq = await timed(async () => {
          const { data, error } = await supabaseAdmin
            .from("email_send_log")
            .select("status", { count: "exact", head: false })
            .eq("status", "pending")
            .limit(1);
          if (error) throw new Error(error.message);
          return data;
        });
        probes.push({
          name: "email_queue",
          status: eq.error ? "degraded" : "ok",
          latency_ms: eq.latency_ms,
          details: eq.error ? { error: (eq.error as Error).message } : {},
        });

        // 4. Recent unresolved errors (last 5 minutes)
        const errCheck = await timed(async () => {
          const since = new Date(Date.now() - 5 * 60_000).toISOString();
          const { count, error } = await supabaseAdmin
            .from("system_errors")
            .select("id", { count: "exact", head: true })
            .eq("resolved", false)
            .gte("occurred_at", since);
          if (error) throw new Error(error.message);
          return count ?? 0;
        });
        const recentErrors = (errCheck.result as number | null) ?? 0;
        probes.push({
          name: "error_rate",
          status: recentErrors > 20 ? "down" : recentErrors > 5 ? "degraded" : "ok",
          latency_ms: errCheck.latency_ms,
          details: { recent_5min: recentErrors },
        });

        // Persist probes (best-effort)
        try {
          await supabaseAdmin.from("system_health_probes").insert(
            probes.map((p) => ({
              probe_name: p.name,
              status: p.status,
              latency_ms: p.latency_ms,
              details: JSON.parse(JSON.stringify(p.details)),
            })),
          );
        } catch {
          /* noop */
        }

        // Opportunistic trim (roughly 5% of calls)
        if (Math.random() < 0.05) {
          try {
            await supabaseAdmin.rpc("system_observability_trim" as never);
          } catch {
            /* noop */
          }
        }

        const overall: ProbeStatus = probes.some((p) => p.status === "down")
          ? "down"
          : probes.some((p) => p.status === "degraded")
            ? "degraded"
            : "ok";

        return new Response(
          JSON.stringify({ status: overall, checked_at: new Date().toISOString(), probes }),
          {
            status: overall === "down" ? 503 : 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});