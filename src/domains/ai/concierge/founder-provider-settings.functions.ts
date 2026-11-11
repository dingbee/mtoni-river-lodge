import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFounderAiAdmin } from "@/domains/ai/ai.authorization.server";

type Provider = "meta_cloud_api" | "resend";

async function founderAdmin(context: any) {
  await assertFounderAiAdmin(context.supabase, context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const listFounderProviderBindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await founderAdmin(context);
    const { data, error } = await admin
      .from("ai_provider_property_bindings")
      .select("id,provider,external_account_id,external_endpoint_id,property_id,channel_id,enabled,inbound_enabled,outbound_enabled,verification_status,credential_secret_ref,configuration_metadata,max_attempts,verified_at,staynas_properties(name)")
      .order("provider")
      .order("external_account_id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      ...row,
      property_name: row.staynas_properties?.name ?? "Unknown property",
      staynas_properties: undefined,
    }));
  });

export const listFounderProviderProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await founderAdmin(context);
    const { data, error } = await admin
      .from("staynas_properties")
      .select("id,name,status")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveFounderProviderBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    provider: Provider;
    external_account_id: string;
    external_endpoint_id: string;
    property_id: string;
    enabled: boolean;
    inbound_enabled: boolean;
    outbound_enabled: boolean;
    credential_secret_ref: string;
    max_attempts: number;
    graph_api_version?: string | null;
  }) => {
    if (!input || !["meta_cloud_api", "resend"].includes(input.provider)) {
      throw new Error("Unsupported provider.");
    }
    const account = String(input.external_account_id ?? "").trim();
    const endpoint = String(input.external_endpoint_id ?? "").trim();
    const propertyId = String(input.property_id ?? "").trim();
    if (!account || !endpoint || !propertyId) throw new Error("Provider account, endpoint and property are required.");
    if (input.provider === "meta_cloud_api" && !/^\d+$/.test(account)) throw new Error("Meta WhatsApp Business Account ID must be numeric.");
    const secretRef = String(input.credential_secret_ref ?? "").trim();
    if (!/^STAYNAS_PROVIDER_[A-Z0-9_]{3,100}$/.test(secretRef)) throw new Error("Use a server-side secret reference beginning STAYNAS_PROVIDER_; never enter a secret value here.");
    if (!Number.isInteger(input.max_attempts) || input.max_attempts < 1 || input.max_attempts > 5) throw new Error("Retry limit must be an integer from 1 to 5.");
    if (account.length > 255 || endpoint.length > 320) throw new Error("Provider identifiers exceed the allowed length.");
    if (input.provider === "resend" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endpoint)) throw new Error("Resend endpoint must be a verified sender email address.");
    if (input.provider === "meta_cloud_api" && (!/^\d+$/.test(endpoint) || !/^v\d+\.\d+$/.test(input.graph_api_version ?? ""))) throw new Error("Meta requires a numeric Phone Number ID and explicit Graph API version.");
    return { ...input, external_account_id: account, external_endpoint_id: endpoint, property_id: propertyId, credential_secret_ref: secretRef };
  })
  .handler(async ({ data, context }) => {
    const admin = await founderAdmin(context);
    const [{ data: property, error: propertyError }, { data: channel, error: channelError }, { data: existing, error: existingError }] = await Promise.all([
      admin.from("staynas_properties").select("id").eq("id", data.property_id).maybeSingle(),
      admin.from("ai_concierge_channels").select("id").eq("channel", data.provider === "meta_cloud_api" ? "whatsapp" : "email").maybeSingle(),
      admin.from("ai_provider_property_bindings").select("id,property_id").eq("provider", data.provider).eq("external_endpoint_id", data.external_endpoint_id).maybeSingle(),
    ]);
    if (propertyError || !property) throw new Error("Selected property does not exist.");
    if (channelError || !channel) throw new Error("The matching concierge channel is not configured.");
    if (existingError) throw new Error(existingError.message);
    if (existing && existing.property_id !== data.property_id) throw new Error("This provider endpoint is already bound to another property. Shared endpoints require an explicit separate routing design.");
    const metadata = data.provider === "meta_cloud_api"
      ? { graph_api_version: data.graph_api_version, inbound_requested: data.inbound_enabled, webhook_challenge_verified_at: null }
      : {};
    const { error } = await admin.from("ai_provider_property_bindings").upsert({
      provider: data.provider,
      external_account_id: data.external_account_id,
      external_endpoint_id: data.external_endpoint_id,
      property_id: data.property_id,
      channel_id: channel.id,
      enabled: data.enabled,
      inbound_enabled: data.inbound_enabled,
      outbound_enabled: data.outbound_enabled,
      credential_secret_ref: data.credential_secret_ref,
      max_attempts: data.max_attempts,
      configuration_metadata: metadata,
      verification_status: "pending",
      verified_at: null,
      verified_by: null,
      updated_by: context.userId,
      ...(!existing ? { created_by: context.userId } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,external_endpoint_id" });
    if (error) throw new Error(error.message);
    return { ok: true, verification_status: "pending" };
  });


export const verifyFounderProviderBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("Provider binding ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const admin = await founderAdmin(context);
    const { data: binding, error } = await admin.from("ai_provider_property_bindings")
      .select("id,provider,external_account_id,external_endpoint_id,credential_secret_ref,configuration_metadata,inbound_enabled,outbound_enabled")
      .eq("id", data.id).maybeSingle();
    if (error || !binding) throw new Error("Provider binding not found.");
    const secretRef = String(binding.credential_secret_ref ?? "");
    if (!/^STAYNAS_PROVIDER_[A-Z0-9_]{3,100}$/.test(secretRef)) throw new Error("A valid server-side secret reference is required.");
    const token = process.env[secretRef];
    if (!token) throw new Error("The referenced server-side provider credential is not provisioned.");

    try {
      if (binding.provider === "meta_cloud_api") {
        const metadata = binding.configuration_metadata && typeof binding.configuration_metadata === "object" ? binding.configuration_metadata : {};
        const version = typeof metadata.graph_api_version === "string" ? metadata.graph_api_version : "";
        if (!/^v\d+\.\d+$/.test(version)) throw new Error("Meta Graph API version is missing or invalid.");
        if (!/^\d+$/.test(String(binding.external_account_id))) throw new Error("Meta WhatsApp Business Account ID must be numeric.");
        if (!process.env.META_APP_SECRET || !process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
          throw new Error("Meta App Secret and webhook verification token must be provisioned before activation.");
        }
        if (!metadata.webhook_challenge_verified_at) {
          throw new Error("The Meta callback URL challenge must be verified in the Meta app before activating this sender.");
        }
        const response = await fetch(`https://graph.facebook.com/${version}/${binding.external_endpoint_id}?fields=id,display_phone_number,verified_name`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`Meta sender verification failed with HTTP ${response.status}.`);
        const result = await response.json() as { id?: string; display_phone_number?: string; verified_name?: string };
        if (result.id !== binding.external_endpoint_id) throw new Error("Meta returned a different Phone Number ID.");
        const wabaResponse = await fetch(`https://graph.facebook.com/${version}/${binding.external_account_id}/phone_numbers?fields=id`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
        });
        if (!wabaResponse.ok) throw new Error(`Meta WABA phone-number association check failed with HTTP ${wabaResponse.status}.`);
        const waba = await wabaResponse.json() as { data?: Array<{ id?: string }> };
        if (!waba.data?.some((phone) => phone.id === binding.external_endpoint_id)) {
          throw new Error("The configured Phone Number ID does not belong to the configured WhatsApp Business Account.");
        }
        const subscriptionResponse = await fetch(`https://graph.facebook.com/${version}/${binding.external_account_id}/subscribed_apps`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
        });
        if (!subscriptionResponse.ok) throw new Error(`Meta WABA webhook subscription failed with HTTP ${subscriptionResponse.status}.`);
        const subscription = await subscriptionResponse.json() as { success?: boolean };
        if (subscription.success !== true) throw new Error("Meta did not confirm the WABA webhook subscription.");
        const { error: updateError } = await admin.from("ai_provider_property_bindings").update({
          verification_status: "verified", verified_at: new Date().toISOString(), verified_by: context.userId,
          inbound_enabled: Boolean(metadata.inbound_requested),
          configuration_metadata: {
            ...metadata, verified_phone_label: result.display_phone_number ?? null,
            verified_business_name: result.verified_name ?? null,
            waba_subscription_verified_at: new Date().toISOString(),
          },
        }).eq("id", binding.id);
        if (updateError) throw new Error(updateError.message);
      } else if (binding.provider === "resend") {
        const domain = String(binding.external_endpoint_id).split("@").pop()?.toLowerCase();
        if (!domain) throw new Error("Resend sender domain could not be resolved.");
        const response = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`Resend domain verification failed with HTTP ${response.status}.`);
        const result = await response.json() as { data?: Array<{ name?: string; status?: string; capabilities?: { sending?: string; receiving?: string } }> };
        const verified = result.data?.find((item) => item.name?.toLowerCase() === domain);
        if (!verified || verified.status !== "verified" || verified.capabilities?.sending !== "enabled") {
          throw new Error("The sender domain is not verified with sending enabled in Resend.");
        }
        const webhookSecret = process.env.RESEND_WEBHOOK_SIGNING_SECRET;
        const webhookAccountId = process.env.RESEND_WEBHOOK_ACCOUNT_ID;
        const baseUrl = process.env.STAYNAS_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        if (!webhookSecret || webhookAccountId !== binding.external_account_id || !baseUrl) {
          throw new Error("Resend webhook signing secret, matching account ID and UAT base URL must be provisioned.");
        }
        const webhookResponse = await fetch("https://api.resend.com/webhooks", {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000),
        });
        if (!webhookResponse.ok) throw new Error(`Resend webhook inspection failed with HTTP ${webhookResponse.status}.`);
        const webhookList = await webhookResponse.json() as { data?: Array<{ endpoint?: string; events?: string[]; status?: string }> };
        const expectedEndpoint = `${baseUrl.replace(/\/$/, "")}/api/public/webhooks/resend`;
        const webhook = webhookList.data?.find((item) => item.endpoint === expectedEndpoint && item.status !== "disabled");
        if (!webhook) throw new Error("No enabled Resend webhook is registered for this UAT endpoint.");
        const requiredEvents = [
          ...(binding.outbound_enabled ? ["email.sent","email.delivered","email.delivery_delayed","email.bounced","email.complained","email.suppressed","contact.updated","suppression.added"] : []),
          ...(binding.inbound_enabled && verified.capabilities.receiving === "enabled" ? ["email.received"] : []),
        ];
        if (!requiredEvents.every((eventName) => webhook.events?.includes(eventName))) {
          throw new Error("The Resend webhook is missing required delivery, suppression or inbound event subscriptions.");
        }
        const { error: updateError } = await admin.from("ai_provider_property_bindings").update({
          verification_status: "verified", verified_at: new Date().toISOString(), verified_by: context.userId,
          inbound_enabled: Boolean(binding.inbound_enabled && verified.capabilities.receiving === "enabled" && webhook.events?.includes("email.received")),
          outbound_enabled: Boolean(binding.outbound_enabled && verified.capabilities.sending === "enabled" && requiredEvents.length > 0),
          configuration_metadata: {
            domain_status: verified.status,
            receiving_enabled: verified.capabilities.receiving === "enabled",
            webhook_endpoint: expectedEndpoint,
            webhook_verified_at: new Date().toISOString(),
          },
        }).eq("id", binding.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        throw new Error("Unsupported provider.");
      }
      return { ok: true, verification_status: "verified" };
    } catch (verificationError) {
      await admin.from("ai_provider_property_bindings").update({
        verification_status: "error", verified_at: null, verified_by: null,
        inbound_enabled: false, outbound_enabled: false,
      }).eq("id", binding.id);
      throw verificationError;
    }
  });


export const listFounderWebhookOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await founderAdmin(context);
    const [{ data: deadLetters, error: deadLetterError }, { data: rejections, error: rejectionError }] = await Promise.all([
      admin.from("ai_provider_webhook_inbox")
        .select("id,property_id,provider,provider_event_id,event_type,attempt_count,last_error,received_at,dead_lettered_at,recovery_requested_at,recovery_reason,staynas_properties(name)")
        .eq("processing_status", "dead_letter").order("dead_lettered_at", { ascending: false }).limit(50),
      admin.from("ai_provider_webhook_rejections")
        .select("id,provider,provider_event_id,event_type,rejection_code,received_at")
        .order("received_at", { ascending: false }).limit(50),
    ]);
    if (deadLetterError) throw new Error(deadLetterError.message);
    if (rejectionError) throw new Error(rejectionError.message);
    return {
      deadLetters: (deadLetters ?? []).map((row: any) => ({
        ...row, property_name: row.staynas_properties?.name ?? "Unknown property",
        recoverable: !row.recovery_requested_at, staynas_properties: undefined,
      })),
      rejections: rejections ?? [],
    };
  });


export const reprocessDeadLetterProviderWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason: string }) => {
    if (!input?.id || !/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("A valid webhook event is required.");
    const reason = String(input.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 500) throw new Error("A recovery reason between 10 and 500 characters is required.");
    return { id: input.id, reason };
  })
  .handler(async ({ data, context }) => {
    const admin = await founderAdmin(context);
    const { data: inbox, error } = await admin.from("ai_provider_webhook_inbox")
      .select("*").eq("id", data.id).eq("processing_status", "dead_letter").maybeSingle();
    if (error || !inbox) throw new Error("Dead-letter webhook event was not found.");
    if (inbox.recovery_requested_at) throw new Error("This webhook event has already used its one-time recovery.");
    const { data: binding, error: bindingError } = await admin.from("ai_provider_property_bindings")
      .select("id,credential_secret_ref,inbound_enabled,outbound_enabled").eq("property_id", inbox.property_id).eq("provider", inbox.provider)
      .eq("external_account_id", inbox.external_account_id)
      .eq("external_endpoint_id", inbox.external_endpoint_id)
      .eq("channel_id", inbox.channel_id).eq("enabled", true)
      .eq("verification_status", "verified").not("credential_secret_ref", "is", null).limit(1).maybeSingle();
    if (bindingError || !binding ||
      (inbox.direction === "inbound" && !binding.inbound_enabled) ||
      (inbox.direction === "outbound" && !binding.outbound_enabled)) {
      throw new Error("The original provider binding is no longer active, verified or authorized for this event direction.");
    }
    const now = new Date().toISOString();
    const { data: requeued, error: requeueError } = await admin.from("ai_provider_webhook_inbox")
      .update({
        processing_status: "failed", next_retry_at: now, processing_started_at: null,
        credential_secret_ref: binding.credential_secret_ref,
        recovery_requested_by: context.userId, recovery_requested_at: now,
        recovery_reason: data.reason,
      })
      .eq("id", inbox.id).eq("processing_status", "dead_letter")
      .is("recovery_requested_at", null).select("*").single();
    if (requeueError || !requeued) throw new Error("The one-time webhook recovery could not be durably authorized.");
    const { processProviderWebhookInbox } = await import("./webhooks/webhook-processor.server");
    return processProviderWebhookInbox(admin, requeued.id);
  });
