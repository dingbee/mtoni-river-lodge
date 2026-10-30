import { createFileRoute } from "@tanstack/react-router";
import { verifyMetaWebhookSignature } from "@/domains/ai/concierge/webhooks/webhook-signatures.server";
import { normalizeMetaWebhook } from "@/domains/ai/concierge/webhooks/webhook-normalization.server";

export const Route = createFileRoute("/api/public/webhooks/meta")({
  server: { handlers: {
    GET: async ({ request }) => {
      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expected = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      if (mode !== "subscribe" || !expected || !token || token !== expected || !challenge) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    },
    POST: async ({ request }) => {
      const raw = await request.text();
      const signature = request.headers.get("x-hub-signature-256");
      const appSecret = process.env.META_APP_SECRET;
      if (!appSecret || !verifyMetaWebhookSignature(raw, signature, appSecret)) {
        return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
      }
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
      try {
        const events = normalizeMetaWebhook(payload);
        if (!events.length) return Response.json({ received: true, persisted: 0 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let persisted = 0, duplicates = 0, rejected = 0;
        for (const event of events) {
          const phoneNumberId = typeof event.safePayload.phoneNumberId === "string" ? event.safePayload.phoneNumberId : null;
          if (!phoneNumberId) { rejected++; continue; }
          const { data: mapping, error: mappingError } = await supabaseAdmin.from("ai_provider_property_bindings")
            .select("property_id,channel_id,external_account_id,enabled")
            .eq("provider", "meta_cloud_api").eq("external_endpoint_id", phoneNumberId).eq("enabled", true).maybeSingle();
          if (mappingError || !mapping) { rejected++; continue; }
          const { data, error } = await supabaseAdmin.from("ai_provider_webhook_inbox").upsert({
            property_id: mapping.property_id, channel_id: mapping.channel_id, provider: "meta_cloud_api",
            external_account_id: mapping.external_account_id, provider_event_id: event.providerEventId,
            event_type: event.eventType, normalized_event: event,
          }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(error.message);
          if (data?.length) persisted++; else duplicates++;
        }
        return Response.json({ received: true, persisted, duplicates, rejected });
      } catch (error) {
        console.error("[webhook:meta] persistence failed", error instanceof Error ? error.message : "unknown");
        return Response.json({ error: "Webhook persistence failed." }, { status: 500 });
      }
    },
  } },
});
