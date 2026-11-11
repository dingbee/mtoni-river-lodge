import { createFileRoute } from "@tanstack/react-router";
import { verifyResendWebhookSignature } from "@/domains/ai/concierge/webhooks/webhook-signatures.server";
import { normalizeResendWebhook } from "@/domains/ai/concierge/webhooks/webhook-normalization.server";

export const Route = createFileRoute("/api/public/webhooks/resend")({
  server: { handlers: {
    POST: async ({ request }) => {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > 1_048_576) return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
      const { consumePublicRateLimit } = await import("@/lib/public-rate-limit.server");
      if (!await consumePublicRateLimit(request, "resend-webhook", 300, 60)) {
        return Response.json({ error: "Webhook rate limit exceeded." }, { status: 429, headers: { "Retry-After": "60" } });
      }
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 1_048_576) return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const events = normalizeResendWebhook(payload, id!);
        if (!events.length) {
          const payloadRecord = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
          const { error: rejectionError } = await (supabaseAdmin as any).from("ai_provider_webhook_rejections").upsert({
            provider: "resend", provider_event_id: id!,
            event_type: typeof payloadRecord.type === "string" ? payloadRecord.type : "unknown",
            rejection_code: "unsupported_or_unparseable_event",
          }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
          if (rejectionError) throw new Error("Unsupported Resend event rejection could not be persisted.");
          return Response.json({ received: true, persisted: 0, rejected: 1 });
        }
        const accountId = process.env.RESEND_WEBHOOK_ACCOUNT_ID;
        if (!accountId) return Response.json({ error: "Resend account routing is not configured." }, { status: 503 });
        const { processProviderWebhookInbox } = await import("@/domains/ai/concierge/webhooks/webhook-processor.server");
        let persisted = 0, duplicates = 0, rejected = 0;
        for (const event of events) {
          const safe = event.safePayload as Record<string, unknown>;
          const accountSuppressionEvent = safe.accountSuppressionEvent === true;
          const endpoint = event.direction === "inbound" ? safe.recipientAddress : safe.senderAddress;
          if (!accountSuppressionEvent && (typeof endpoint !== "string" || !endpoint.includes("@"))) {
            const { error: rejectionError } = await (supabaseAdmin as any).from("ai_provider_webhook_rejections").upsert({
              provider: "resend", provider_event_id: event.providerEventId,
              event_type: event.eventType, rejection_code: "invalid_endpoint",
            }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
            if (rejectionError) throw new Error(rejectionError.message);
            rejected++; continue;
          }
          let mappingQuery = (supabaseAdmin as any).from("ai_provider_property_bindings")
            .select("property_id,channel_id,external_account_id,enabled,inbound_enabled,outbound_enabled")
            .eq("provider", "resend").eq("external_account_id", accountId)
            .eq("verification_status", "verified");
          if (accountSuppressionEvent) {
            mappingQuery = mappingQuery.eq("enabled", true).eq("outbound_enabled", true);
          } else {
            mappingQuery = mappingQuery.eq("external_endpoint_id", endpoint);
            if (event.direction === "inbound") mappingQuery = mappingQuery.eq("enabled", true).eq("inbound_enabled", true);
          }
          const { data: mappings, error: mappingError } = await mappingQuery.limit(1);
          if (mappingError) throw new Error(mappingError.message);
          const mapping = mappings?.[0] ?? null;
          if (!mapping) {
            const { error: rejectionError } = await (supabaseAdmin as any).from("ai_provider_webhook_rejections").upsert({
              provider: "resend", provider_event_id: event.providerEventId,
              event_type: event.eventType, rejection_code: "unmapped_endpoint",
            }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
            if (rejectionError) throw new Error(rejectionError.message);
            rejected++; continue;
          }
          const { data, error } = await (supabaseAdmin as any).from("ai_provider_webhook_inbox").upsert({
            property_id: mapping.property_id, channel_id: mapping.channel_id, provider: "resend",
            external_account_id: mapping.external_account_id, provider_event_id: event.providerEventId,
            event_type: event.eventType, normalized_event: event,
          }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(error.message);
          let inboxId = data?.[0]?.id as string | undefined;
          if (inboxId) persisted++;
          else {
            duplicates++;
            const { data: existing, error: lookupError } = await (supabaseAdmin as any).from("ai_provider_webhook_inbox")
              .select("id").eq("provider", "resend").eq("provider_event_id", event.providerEventId).maybeSingle();
            if (lookupError) throw new Error(lookupError.message);
            inboxId = existing?.id;
          }
          if (inboxId) await processProviderWebhookInbox(supabaseAdmin, inboxId);
        }
        return Response.json({ received: true, persisted, duplicates, rejected });
      } catch (error) {
        console.error("[webhook:resend] persistence failed");
        return Response.json({ error: "Webhook persistence failed." }, { status: 500 });
      }
    },
  } },
});
