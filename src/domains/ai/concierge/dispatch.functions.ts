import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function communicationDraftFingerprint(input: {
  subject?: string | null;
  body: string;
  providerTemplateName?: string | null;
  providerTemplateLanguage?: string | null;
  providerTemplateComponents?: unknown;
}): string {
  return sha256Hex(JSON.stringify({
    subject: input.subject ?? null,
    body: input.body,
    providerTemplateName: input.providerTemplateName ?? null,
    providerTemplateLanguage: input.providerTemplateLanguage ?? null,
    providerTemplateComponents: input.providerTemplateComponents ?? null,
  }));
}


type Channel = "whatsapp" | "email";
type Provider = "meta_cloud_api" | "resend";

async function requireManagerProperty(supabase: any, userId: string): Promise<string> {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("No active property selected.");
  const { data: member, error: memberError } = await supabase.from("staynas_property_members")
    .select("property_id").eq("user_id", userId).eq("property_id", propertyId)
    .eq("status", "active").in("role", ["owner", "manager", "admin"]).maybeSingle();
  if (memberError || !member) throw new Error("Property manager authorization required.");
  return String(propertyId);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeError(error: unknown): { code: string; message: string; retryable: boolean; retryAfterSeconds: number | null; uncertain: boolean } {
  const value = error as Error & {
    provider?: string; status?: number | null; code?: string | null;
    retryable?: boolean; retryAfterSeconds?: number | null;
  };
  if (value instanceof Error && (value.provider === "meta_cloud_api" || value.provider === "resend")) {
    const uncertain = value.provider === "meta_cloud_api" &&
      (value.code === "network_error" || value.status === 408 || (value.status !== undefined && value.status !== null && value.status >= 500));
    const message = value.message
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(/\+?\d{8,15}/g, "[REDACTED_PHONE]")
      .slice(0, 300);
    const providerCode = value.code === null || value.code === undefined ? "" : String(value.code).slice(0, 40);
    const code = value.status
      ? `http_${value.status}${providerCode ? `_${providerCode}` : ""}`
      : providerCode || "provider_error";
    return {
      code,
      message,
      retryable: Boolean(value.retryable) && (value.provider === "resend" || value.status === 429),
      retryAfterSeconds: value.retryAfterSeconds ?? null,
      uncertain,
    };
  }
  return { code: "dispatch_error", message: "Provider dispatch failed.", retryable: false, retryAfterSeconds: null, uncertain: false };
}

export async function dispatchCommunicationDraftForProperty(input: {
  propertyId: string;
  draftId: string;
  actorId: string | null;
}) {
  const propertyId = input.propertyId;
  const actorId = input.actorId;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
    const { data: draft, error: draftError } = await admin.from("ai_communication_drafts")
      .select("id,session_id,guest_id,booking_id,channel,draft_type,subject,body,status,approved_by,approved_by_system,approved_at,approved_content_hash,approved_content_version,content_version,provider_template_name,provider_template_language,provider_template_components")
      .eq("id", input.draftId).maybeSingle();
    if (draftError || !draft) throw new Error("Draft not found in the active property.");
    if (!draft.session_id || !["whatsapp", "email"].includes(draft.channel)) {
      throw new Error("Only property-scoped WhatsApp and email drafts can be dispatched.");
    }
    if (draft.status !== "approved" || (!draft.approved_by && !draft.approved_by_system) || !draft.approved_at ||
        draft.approved_content_version !== draft.content_version) {
      throw new Error("An approved draft with a matching content version is required before dispatch.");
    }

    const { data: session, error: sessionError } = await admin.from("ai_concierge_sessions")
      .select("id,property_id,guest_id,guest_email,guest_phone")
      .eq("id", draft.session_id).eq("property_id", propertyId).maybeSingle();
    if (sessionError || !session) throw new Error("Conversation not found in the active property.");
    if (draft.guest_id && session.guest_id && draft.guest_id !== session.guest_id) {
      throw new Error("Draft guest association does not match the conversation.");
    }
    const rawExternalContact = draft.channel === "whatsapp" ? session.guest_phone : session.guest_email;
    if (typeof rawExternalContact !== "string" || !rawExternalContact.trim()) {
      throw new Error("The conversation has no verified channel contact address.");
    }
    const externalContact = draft.channel === "email" ? rawExternalContact.trim().toLowerCase() : rawExternalContact.trim();

    const provider: Provider = draft.channel === "whatsapp" ? "meta_cloud_api" : "resend";
    const purpose = draft.draft_type === "follow_up" ? "marketing" : draft.draft_type === "concierge_response" ? "service" : draft.booking_id ? "transactional" : "service";
    const fingerprint = await communicationDraftFingerprint({
      subject: draft.subject,
      body: draft.body,
      providerTemplateName: draft.provider_template_name,
      providerTemplateLanguage: draft.provider_template_language,
      providerTemplateComponents: draft.provider_template_components,
    });
    if (draft.approved_content_hash !== fingerprint) {
      throw new Error("Approved content has changed. Re-approve the current draft before dispatch.");
    }

    const { data: settings, error: settingsError } = await admin.from("ai_property_channel_settings")
      .select("enabled,outbound_enabled,sender_display_name,sender_email,approved_template_names")
      .eq("property_id", propertyId).eq("channel", draft.channel).maybeSingle();
    if (settingsError || !settings?.enabled || !settings?.outbound_enabled) {
      throw new Error("Outbound communication is disabled for this property channel.");
    }

    if (provider === "resend" && !settings.sender_email) {
      throw new Error("A property-specific Resend sender identity must be configured before dispatch.");
    }
    let bindingQuery = admin.from("ai_provider_property_bindings")
      .select("id,provider,external_account_id,external_endpoint_id,credential_secret_ref,configuration_metadata,max_attempts,enabled,inbound_enabled,outbound_enabled,verification_status")
      .eq("property_id", propertyId).eq("provider", provider)
      .eq("enabled", true).eq("outbound_enabled", true).eq("verification_status", "verified");
    if (provider === "resend" && settings.sender_email) {
      bindingQuery = bindingQuery.eq("external_endpoint_id", settings.sender_email);
    }
    const { data: binding, error: bindingError } = await bindingQuery.limit(2).maybeSingle();
    if (bindingError || !binding) throw new Error("No verified outbound provider binding exists for this property.");
    const secretRef = typeof binding.credential_secret_ref === "string" ? binding.credential_secret_ref : "";
    if (!/^STAYNAS_PROVIDER_[A-Z0-9_]{3,100}$/.test(secretRef)) {
      throw new Error("The property provider binding has no valid secret reference.");
    }
    const providerSecret = process.env[secretRef];
    if (!providerSecret) throw new Error("The server-side credential referenced by this property binding is not provisioned.");

    let whatsappTemplate: { name: string; languageCode: string; components?: Array<Record<string, unknown>> } | null = null;
    if (draft.channel === "whatsapp") {
      if (typeof session.guest_phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(session.guest_phone)) {
        throw new Error("The guest has no valid WhatsApp E.164 contact.");
      }
      const { data: lastInbound, error: inboundError } = await admin.from("ai_omnichannel_messages")
        .select("occurred_at").eq("property_id", propertyId).eq("session_id", session.id)
        .eq("channel", "whatsapp").eq("direction", "inbound")
        .order("occurred_at", { ascending: false }).limit(1).maybeSingle();
      if (inboundError) throw new Error("Could not verify the WhatsApp customer-service window.");
      const inboundAgeMs = lastInbound?.occurred_at
        ? Date.now() - new Date(lastInbound.occurred_at).getTime()
        : Number.POSITIVE_INFINITY;
      const inServiceWindow = inboundAgeMs >= 0 && inboundAgeMs < 24 * 60 * 60 * 1000;
      if (!inServiceWindow) {
        const templateName = typeof draft.provider_template_name === "string" ? draft.provider_template_name : "";
        const languageCode = typeof draft.provider_template_language === "string" ? draft.provider_template_language : "";
        const approvedNames = Array.isArray(settings.approved_template_names) ? settings.approved_template_names : [];
        if (!templateName || !languageCode || !approvedNames.includes(templateName)) {
          throw new Error("The WhatsApp 24-hour service window is closed. Select a property-approved template before dispatch.");
        }
        whatsappTemplate = {
          name: templateName,
          languageCode,
          ...(Array.isArray(draft.provider_template_components)
            ? { components: draft.provider_template_components as Array<Record<string, unknown>> }
            : {}),
        };
      }
    } else if (typeof session.guest_email !== "string" || !session.guest_email.trim()) {
      throw new Error("The guest has no email address.");
    }

    const idempotencyKey = await sha256Hex([propertyId, draft.id, fingerprint].join(":"));
    const { data: claimData, error: claimError } = await admin.rpc("staynas_claim_communication_dispatch", {
      p_property_id: propertyId,
      p_binding_id: binding.id,
      p_session_id: session.id,
      p_draft_id: draft.id,
      p_provider: provider,
      p_channel: draft.channel,
      p_purpose: purpose,
      p_external_contact: externalContact,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: fingerprint,
      p_max_attempts: Number(binding.max_attempts ?? 3),
      p_actor_id: actorId,
    });
    if (claimError) throw new Error("Dispatch authorization failed: " + claimError.message);
    const claim = Array.isArray(claimData) ? claimData[0] : claimData;
    if (!claim || claim.state !== "claimed") {
      return {
        state: claim?.state ?? "blocked",
        message_id: claim?.message_id ?? null,
        attempt_id: claim?.attempt_id ?? null,
        next_retry_at: claim?.next_retry_at ?? null,
      };
    }

    let providerResult: { providerMessageId: string; acceptedAt: string };
    try {
      if (provider === "meta_cloud_api") {
        const { sendWhatsAppText, sendWhatsAppTemplate } = await import("./providers/meta-whatsapp.server");
        const metadata = asRecord(binding.configuration_metadata);
        const graphApiVersion = typeof metadata.graph_api_version === "string" ? metadata.graph_api_version : "";
        if (!graphApiVersion) throw new Error("Graph API version is not configured on the property binding.");
        const config = { accessToken: providerSecret, phoneNumberId: binding.external_endpoint_id, graphApiVersion };
        providerResult = whatsappTemplate
          ? await sendWhatsAppTemplate({
              to: session.guest_phone,
              name: whatsappTemplate.name,
              languageCode: whatsappTemplate.languageCode,
              components: whatsappTemplate.components,
              idempotencyKey,
            }, { config })
          : await sendWhatsAppText({ to: session.guest_phone, text: draft.body, idempotencyKey }, { config });
      } else {
        const { sendResendEmail } = await import("./providers/resend-email.server");
        const sender = String(binding.external_endpoint_id ?? "");
        if (!sender.includes("@")) throw new Error("The verified property sender identity is invalid.");
        const displayName = typeof settings.sender_display_name === "string" ? settings.sender_display_name.trim() : "";
        const from = displayName ? `"${displayName.replace(/["\r\n]/g, "")}" <${sender}>` : sender;
        providerResult = await sendResendEmail({
          from,
          to: externalContact,
          subject: draft.subject || "A message from the property",
          text: draft.body,
          idempotencyKey,
        }, { config: { apiKey: providerSecret } });
      }
    } catch (error) {
      const failure = safeError(error);
      const attemptNumber = Number(claim.attempt_number ?? 1);
      const delaySeconds = Math.max(
        failure.retryAfterSeconds ?? 0,
        Math.min(3600, 60 * (2 ** Math.max(0, attemptNumber - 1))),
      );
      const retryable = failure.retryable && attemptNumber < Number(binding.max_attempts ?? 3);
      const nextRetryAt = retryable ? new Date(Date.now() + delaySeconds * 1000).toISOString() : null;
      const status = retryable ? "retryable_failure" : "permanent_failure";
      const uncertain = failure.uncertain;
      const { error: failureWriteError } = await admin.rpc("staynas_fail_communication_dispatch", {
        p_property_id: propertyId,
        p_attempt_id: claim.attempt_id,
        p_message_id: claim.message_id,
        p_status: status,
        p_next_retry_at: nextRetryAt,
        p_error_code: uncertain ? "delivery_outcome_uncertain" : failure.code,
        p_error_summary: failure.message,
        p_mark_message_failed: !retryable && !uncertain,
      });
      if (failureWriteError) throw new Error("Provider failure could not be durably recorded; dispatch remains blocked for reconciliation.");
      return {
        state: uncertain ? "delivery_outcome_uncertain" : status,
        message_id: claim.message_id,
        attempt_id: claim.attempt_id,
        next_retry_at: nextRetryAt,
        error_code: uncertain ? "delivery_outcome_uncertain" : failure.code,
        error: failure.message,
      };
    }

    const acceptedAt = providerResult.acceptedAt;
    const { error: completionError } = await admin.rpc("staynas_complete_communication_dispatch", {
      p_property_id: propertyId,
      p_attempt_id: claim.attempt_id,
      p_message_id: claim.message_id,
      p_draft_id: draft.id,
      p_provider_message_id: providerResult.providerMessageId,
      p_accepted_at: acceptedAt,
      p_fingerprint: fingerprint,
    });
    if (completionError) {
      const { error: quarantineError } = await admin.rpc("staynas_fail_communication_dispatch", {
        p_property_id: propertyId,
        p_attempt_id: claim.attempt_id,
        p_message_id: claim.message_id,
        p_status: "permanent_failure",
        p_next_retry_at: null,
        p_error_code: "accepted_ledger_completion_failed",
        p_error_summary: "Provider accepted the message, but the ledger completion failed. Reconcile this attempt; do not resend.",
        p_mark_message_failed: false,
      });
      if (quarantineError) {
        throw new Error("Provider accepted the message and the dispatch ledger could not be reconciled. Do not resend; manual reconciliation is required.");
      }
      throw new Error("Provider accepted the message, but the atomic ledger completion failed. Do not resend; reconcile the existing dispatch attempt.");
    }
    return {
      state: "accepted",
      message_id: claim.message_id,
      attempt_id: claim.attempt_id,
      provider_message_id: providerResult.providerMessageId,
    };

}

export const dispatchCommunicationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id || !/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("A valid draft is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requireManagerProperty(context.supabase, context.userId);
    return dispatchCommunicationDraftForProperty({
      propertyId, draftId: data.id, actorId: context.userId,
    });
  });


/** Server-only retry worker entrypoint. It reuses the same authorization,
 * approval, consent, binding, idempotency and provider dispatch path as staff. */
export async function retryDueCommunicationDispatches(limit = 50) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const now = new Date().toISOString();
  const { data: due, error } = await admin.from("ai_communication_dispatch_attempts")
    .select("id,property_id,draft_id,message_id,attempt_number")
    .eq("status", "retryable_failure")
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error("Due communication retries could not be loaded.");
  const unique = new Map<string, { propertyId: string; draftId: string; attemptId: string; messageId: string; attemptNumber: number }>();
  for (const row of due ?? []) {
    if (!row.draft_id || !row.property_id) continue;
    const previous = unique.get(row.draft_id);
    if (!previous || Number(row.attempt_number) > previous.attemptNumber) {
      unique.set(row.draft_id, {
        propertyId: row.property_id, draftId: row.draft_id,
        attemptId: row.id, messageId: row.message_id,
        attemptNumber: Number(row.attempt_number ?? 0),
      });
    }
  }
  let accepted = 0, rescheduled = 0, terminal = 0, skippedStale = 0;
  for (const item of unique.values()) {
    const { data: latestAttempt, error: latestError } = await admin.from("ai_communication_dispatch_attempts")
      .select("id,status,next_retry_at").eq("property_id", item.propertyId).eq("draft_id", item.draftId)
      .order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw new Error("Latest dispatch attempt could not be checked.");
    if (!latestAttempt || latestAttempt.id !== item.attemptId || latestAttempt.status !== "retryable_failure") {
      skippedStale++;
      continue;
    }
    try {
      const result = await dispatchCommunicationDraftForProperty({
        propertyId: item.propertyId, draftId: item.draftId, actorId: null,
      });
      if (result.state === "accepted") accepted++;
      else if (result.state === "retryable_failure" || result.state === "retry_scheduled") rescheduled++;
      else terminal++;
    } catch (retryError) {
      const outcomeUncertain = retryError instanceof Error && retryError.message.includes("Provider accepted the message");
      const { error: attemptError } = await admin.from("ai_communication_dispatch_attempts")
        .update({
          status: "permanent_failure", next_retry_at: null, finished_at: now,
          error_code: "retry_preflight_failed",
          error_summary: "Retry preflight failed; verify approval, consent and provider configuration before a new dispatch.",
        })
        .eq("id", item.attemptId).eq("status", "retryable_failure");
      if (attemptError) throw new Error("A blocked retry could not be moved to terminal failure.");
      if (!outcomeUncertain) {
        await admin.from("ai_omnichannel_messages").update({ status: "failed" })
          .eq("id", item.messageId).eq("property_id", item.propertyId).eq("status", "queued");
      }
      terminal++;
    }
  }
  return { scanned: due?.length ?? 0, uniqueDrafts: unique.size, accepted, rescheduled, terminal, skippedStale };
}


export const recoverCommunicationDispatchAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason: string }) => {
    if (!input?.id || !/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("A valid dispatch attempt is required.");
    const reason = String(input.reason ?? "").trim();
    if (reason.length < 10 || reason.length > 500) throw new Error("A recovery reason between 10 and 500 characters is required.");
    return { id: input.id, reason };
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requireManagerProperty(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: attempt, error } = await admin.from("ai_communication_dispatch_attempts")
      .select("id,property_id,draft_id,message_id,provider,status,error_code,attempt_number")
      .eq("id", data.id).eq("property_id", propertyId).maybeSingle();
    if (error || !attempt) throw new Error("Dispatch attempt was not found in this property.");
    if (attempt.status !== "permanent_failure" || !attempt.draft_id) {
      throw new Error("Only the latest eligible terminal attempt can be recovered.");
    }
    const { data: latest, error: latestError } = await admin.from("ai_communication_dispatch_attempts")
      .select("id").eq("property_id", propertyId).eq("draft_id", attempt.draft_id)
      .order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    if (latestError || latest?.id !== attempt.id) throw new Error("A newer dispatch attempt exists; this attempt cannot be recovered.");
    const { data: previousRecovery, error: previousRecoveryError } = await admin.from("ai_communication_dispatch_attempts")
      .select("id").eq("property_id", propertyId).eq("draft_id", attempt.draft_id)
      .not("recovery_requested_at", "is", null).limit(1).maybeSingle();
    if (previousRecoveryError) throw new Error("Previous recovery authorization could not be checked.");
    if (previousRecovery) throw new Error("This draft has already used its one-time manual recovery.");
    const httpStatus = Number(/^http_(\d{3})/.exec(String(attempt.error_code ?? ""))?.[1] ?? 0);
    const recoverable = attempt.provider === "meta_cloud_api"
      ? httpStatus === 429
      : attempt.provider === "resend"
        && ([408, 425, 429].includes(httpStatus) || httpStatus >= 500 || attempt.error_code === "network_error");
    if (!recoverable) {
      throw new Error("This failure may be permanent or have an uncertain delivery outcome; automatic recovery is not permitted.");
    }
    const now = new Date().toISOString();
    const { error: requeueError } = await admin.from("ai_communication_dispatch_attempts")
      .update({
        status: "retryable_failure", next_retry_at: now, finished_at: null,
        manual_retry_authorized: true, recovery_requested_by: context.userId,
        recovery_requested_at: now, recovery_reason: data.reason,
      })
      .eq("id", attempt.id).eq("property_id", propertyId).eq("status", "permanent_failure");
    if (requeueError) throw new Error("The one-time recovery authorization could not be recorded.");
    try {
      return await dispatchCommunicationDraftForProperty({
        propertyId, draftId: attempt.draft_id, actorId: context.userId,
      });
    } catch (recoveryError) {
      const uncertain = recoveryError instanceof Error && recoveryError.message.includes("Provider accepted the message");
      await admin.from("ai_communication_dispatch_attempts").update({
        status: "permanent_failure", next_retry_at: null, finished_at: new Date().toISOString(),
        manual_retry_authorized: false, error_code: uncertain ? "accepted_ledger_completion_failed" : "manual_recovery_preflight_failed",
        error_summary: uncertain
          ? "Provider acceptance is uncertain in the local ledger. Reconcile before any further send."
          : "Manual recovery preflight failed. Recheck approval, consent and provider binding.",
      }).eq("id", attempt.id).eq("property_id", propertyId).eq("status", "retryable_failure");
      if (!uncertain) {
        await admin.from("ai_omnichannel_messages").update({ status: "failed" })
          .eq("id", attempt.message_id).eq("property_id", propertyId).eq("status", "queued");
      }
      throw recoveryError;
    }
  });
