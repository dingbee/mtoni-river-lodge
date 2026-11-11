import { createHash } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { verifyMetaWebhookChallenge, verifyMetaWebhookSignature } from "@/domains/ai/concierge/webhooks/webhook-signatures.server";
import { normalizeMetaWebhook } from "@/domains/ai/concierge/webhooks/webhook-normalization.server";

export const Route = createFileRoute("/api/public/webhooks/meta")({
  server: { handlers: {
    GET: async ({ request }) => {
      const { consumePublicRateLimit } = await import("@/lib/public-rate-limit.server");
      if (!await consumePublicRateLimit(request, "meta-webhook-challenge", 10, 60)) {
        return Response.json({ error: "Webhook verification rate limit exceeded." }, { status: 429, headers: { "Retry-After": "60" } });
      }
      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expected = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      if (mode !== "subscribe" || !expected || !token || !verifyMetaWebhookChallenge(token, expected) || !challenge) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: bindings, error } = await (supabaseAdmin as any).from("ai_provider_property_bindings")
          .select("id,enabled,verification_status,configuration_metadata").eq("provider", "meta_cloud_api");
        if (error) throw error;
        const appSecretConfigured = Boolean(process.env.META_APP_SECRET);
        for (const binding of bindings ?? []) {
          const metadata = binding.configuration_metadata && typeof binding.configuration_metadata === "object" ? binding.configuration_metadata : {};
          await (supabaseAdmin as any).from("ai_provider_property_bindings").update({
            inbound_enabled: Boolean(binding.enabled && binding.verification_status === "verified" && appSecretConfigured && metadata.inbound_requested),
            configuration_metadata: { ...metadata, webhook_challenge_verified_at: new Date().toISOString() },
          }).eq("id", binding.id);
        }
      } catch {
        return Response.json({ error: "Webhook challenge state could not be persisted." }, { status: 500 });
      }
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    },
    POST: async ({ request }) => {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > 1_048_576) return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
      const { consumePublicRateLimit } = await import("@/lib/public-rate-limit.server");
      if (!await consumePublicRateLimit(request, "meta-webhook", 300, 60)) {
        return Response.json({ error: "Webhook rate limit exceeded." }, { status: 429, headers: { "Retry-After": "60" } });
      }
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 1_048_576) return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
      const signature = request.headers.get("x-hub-signature-256");
      const appSecret = process.env.META_APP_SECRET;
      if (!appSecret || !verifyMetaWebhookSignature(raw, signature, appSecret)) {
        return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
      }
      let payload: unknown;
      try { payload = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
      try {
        const events = normalizeMetaWebhook(payload);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!events.length) {
          const payloadRecord = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
          const rejectionId = "unparsed:" + createHash("sha256").update(raw).digest("hex");
          const { error: rejectionError } = await (supabaseAdmin as any).from("ai_provider_webhook_rejections").upsert({
            provider: "meta_cloud_api", provider_event_id: rejectionId,
            event_type: typeof payloadRecord.object === "string" ? payloadRecord.object : "unknown",
            rejection_code: "unsupported_or_unparseable_event",
          }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
          if (rejectionError) throw new Error("Unsupported Meta event rejection could not be persisted.");
          return Response.json({ received: true, persisted: 0, rejected: 1 });
        }
        const { processProviderWebhookInbox } = await import("@/domains/ai/concierge/webhooks/webhook-processor.server");
        let persisted = 0, duplicates = 0, rejected = 0;
        for (const event of events) {
          const phoneNumberId = typeof event.safePayload.phoneNumberId === "string" ? event.safePayload.phoneNumberId : null;
          if (!phoneNumberId) {
            await (supabaseAdmin as any).from("ai_provider_webhook_rejections").upsert({
              provider: "meta_cloud_api", provider_event_id: event.providerEventId,
              event_type: event.eventType, rejection_code: "invalid_endpoint",
            }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
            rejected++; continue;
          }
          let mappingQuery = (supabaseAdmin as any).from("ai_provider_property_bindings")
            .select("property_id,channel_id,external_account_id,enabled,inbound_enabled")
            .eq("provider", "meta_cloud_api").eq("external_endpoint_id", phoneNumberId)
            .eq("verification_status", "verified");
          if (event.direction === "inbound") mappingQuery = mappingQuery.eq("enabled", true).eq("inbound_enabled", true);
          const { data: mapping, error: mappingError } = await mappingQuery.maybeSingle();
          if (mappingError) throw new Error(mappingError.message);
          if (!mapping) {
            await (supabaseAdmin as any).from("ai_provider_webhook_rejections").upsert({
              provider: "meta_cloud_api", provider_event_id: event.providerEventId,
              event_type: event.eventType, rejection_code: "unmapped_endpoint",
            }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
            rejected++; continue;
          }
          const { data, error } = await (supabaseAdmin as any).from("ai_provider_webhook_inbox").upsert({
            property_id: mapping.property_id, channel_id: mapping.channel_id, provider: "meta_cloud_api",
            external_account_id: mapping.external_account_id, provider_event_id: event.providerEventId,
            event_type: event.eventType, normalized_event: event,
          }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(error.message);
          let inboxId = data?.[0]?.id as string | undefined;
          if (inboxId) persisted++;
          else {
            duplicates++;
            const { data: existing, error: lookupError } = await (supabaseAdmin as any).from("ai_provider_webhook_inbox")
              .select("id").eq("provider", "meta_cloud_api").eq("provider_event_id", event.providerEventId).maybeSingle();
            if (lookupError) throw new Error(lookupError.message);
            inboxId = existing?.id;
          }
          if (inboxId) await processProviderWebhookInbox(supabaseAdmin, inboxId);
        }
        return Response.json({ received: true, persisted, duplicates, rejected });
      } catch (error) {
        console.error("[webhook:meta] persistence failed");
        return Response.json({ error: "Webhook persistence failed." }, { status: 500 });
      }
    },
  } },
});
