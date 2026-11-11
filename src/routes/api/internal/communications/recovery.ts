import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/internal/communications/recovery")({
  server: { handlers: {
    GET: async ({ request }) => {
      const secret = process.env.CRON_SECRET;
      if (!secret) return Response.json({ error: "Recovery worker is not configured." }, { status: 503 });
      const supplied = request.headers.get("authorization") ?? "";
      const expected = `Bearer ${secret}`;
      const left = Buffer.from(supplied);
      const right = Buffer.from(expected);
      if (left.length !== right.length || !timingSafeEqual(left, right)) {
        return Response.json({ error: "Unauthorized." }, { status: 401 });
      }
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processProviderWebhookInbox } = await import("@/domains/ai/concierge/webhooks/webhook-processor.server");
        const { retryDueCommunicationDispatches } = await import("@/domains/ai/concierge/dispatch.functions");
        const admin = supabaseAdmin as any;
        const now = new Date().toISOString();
        const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: rows, error } = await admin.from("ai_provider_webhook_inbox")
          .select("id")
          .or(`processing_status.eq.received,and(processing_status.eq.failed,next_retry_at.is.null),and(processing_status.eq.failed,next_retry_at.lte.${now}),and(processing_status.eq.processing,processing_started_at.lt.${staleBefore})`)
          .order("received_at", { ascending: true }).limit(100);
        if (error) throw new Error(error.message);
        let processed = 0, failed = 0, skipped = 0;
        for (const row of rows ?? []) {
          try {
            const result = await processProviderWebhookInbox(admin, row.id);
            if (result.claimed && result.processed) processed++;
            else skipped++;
          } catch {
            failed++;
          }
        }
        const dispatchRetries = await retryDueCommunicationDispatches(50);
        return Response.json({
          webhooks: { scanned: rows?.length ?? 0, processed, failed, skipped },
          dispatchRetries,
        });
      } catch {
        return Response.json({ error: "Communication recovery could not complete." }, { status: 500 });
      }
    },
  } },
});
