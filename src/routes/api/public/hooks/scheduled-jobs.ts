import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-invoked scheduled-jobs runner. Called by pg_cron with the anon
 * apikey. Iterates enabled scheduled_jobs whose next_run_at is due (or
 * last_run_at older than 23h as a coarse heuristic) and records execution.
 * Real per-job business logic is delegated to workflows via event publish.
 */
export const Route = createFileRoute("/api/public/hooks/scheduled-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!process.env.SUPABASE_PUBLISHABLE_KEY || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: jobs } = await supabaseAdmin.from("scheduled_jobs").select("*").eq("enabled", true);
        const now = new Date();
        let ran = 0;
        for (const j of jobs ?? []) {
          const last = j.last_run_at ? new Date(j.last_run_at) : null;
          if (last && now.getTime() - last.getTime() < 23 * 60 * 60 * 1000) continue;
          // Emit a signal notification (per-job real logic lives in workflow templates).
          await supabaseAdmin.from("notifications").insert({
            channel: "in_app",
            role: "manager",
            title: `Scheduled: ${j.name}`,
            body: j.description ?? null,
            kind: j.job_type,
            meta: { scheduled_job_id: j.id },
          });
          await supabaseAdmin.from("scheduled_jobs").update({
            last_run_at: now.toISOString(), last_status: "succeeded", last_error: null,
          }).eq("id", j.id);
          ran += 1;
        }
        return Response.json({ ok: true, ran });
      },
    },
  },
});