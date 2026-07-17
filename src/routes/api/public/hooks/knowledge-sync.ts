import { createFileRoute } from "@tanstack/react-router";

/**
 * pg_cron-invoked scheduled knowledge sync.
 * Authenticates via Supabase anon apikey. Runs read-only pulls from
 * published Journal / CMS / Rooms into ai_knowledge_sources. Never edits
 * customer-facing content.
 */
export const Route = createFileRoute("/api/public/hooks/knowledge-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!process.env.SUPABASE_PUBLISHABLE_KEY || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("unauthorized", { status: 401 });
        }
        try {
          const { runKnowledgeSyncJob } = await import("@/domains/ai/knowledge-intelligence.server");
          const result = await runKnowledgeSyncJob({ triggeredBy: "cron" });
          return Response.json(result);
        } catch (e: any) {
          return Response.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});