import { createFileRoute } from "@tanstack/react-router";
import { verifyResendWebhookSignature } from "@/domains/ai/concierge/webhooks/webhook-signatures.server";
import { normalizeResendWebhook } from "@/domains/ai/concierge/webhooks/webhook-normalization.server";

export const Route = createFileRoute("/api/public/webhooks/resend")({
  server: { handlers: {
    POST: async ({ request }) => {
      const raw = await request.text();
      const id = request.headers.get("svix-id");
      const timestamp = request.headers.get("svix-timestamp");
      const signature = request.headers.get("svix-signature");
      const secret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
      if (!secret || !verifyResendWebhookSignature(raw, { id, timestamp, signature }, secret)) {
        return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
      }
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
      try {
        const events = normalizeResendWebhook(payload, id!);
        if (!events.length) return Response.json({ received: true, persisted: 0 });
        const accountId = process.env.RESEND_WEBHOOK_ACCOUNT_ID;
        if (!accountId) return Response.json({ error: "Resend account routing is not configured." }, { status: 503 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: mapping, error: mappingError } = await supabaseAdmin.from("ai_provider_property_bindings")
          .select("property_id,channel_id,external_account_id,enabled")
          .eq("provider", "resend").eq("external_account_id", accountId).eq("enabled", true).maybeSingle();
        if (mappingError || !mapping) return Response.json({ error: "No active founder-managed property mapping." }, { status: 202 });
        let persisted = 0, duplicates = 0;
        for (const event of events) {
          const { data, error } = await supabaseAdmin.from("ai_provider_webhook_inbox").upsert({
            property_id: mapping.property_id, channel_id: mapping.channel_id, provider: "resend",
            external_account_id: mapping.external_account_id, provider_event_id: event.providerEventId,
            event_type: event.eventType, normalized_event: event,
          }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(error.message);
          if (data?.length) persisted++; else duplicates++;
        }
        return Response.json({ received: true, persisted, duplicates });
      } catch (error) {
        console.error("[webhook:resend] persistence failed", error instanceof Error ? error.message : "unknown");
        return Response.json({ error: "Webhook persistence failed." }, { status: 500 });
      }
    },
  } },
});
