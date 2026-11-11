/* eslint-disable @typescript-eslint/no-explicit-any -- These provider tables and RPCs are newer than the generated Supabase Database type; the migration acceptance suite validates their contracts. */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/integrations/supabase/types";
import type { NormalizedProviderEvent } from "./webhook-normalization.server";

type Provider = "meta_cloud_api" | "resend";
type InboxRow = Pick<
  Tables<"ai_provider_webhook_inbox">,
  "id" | "property_id" | "channel_id" | "external_account_id" | "provider_event_id" | "event_type" | "processing_status"
> & {
  provider: Provider;
  normalized_event: NormalizedProviderEvent;
  attempt_count: number;
};
type WebhookClient = SupabaseClient<Database>;

const providerName = (provider: Provider) => provider === "meta_cloud_api" ? "meta_cloud_api" : "resend";
export const messageStatus = (event: NormalizedProviderEvent["eventType"]) => {
  if (event === "sent") return "accepted";
  if (event === "delivered") return "delivered";
  if (event === "read") return "read";
  if (event === "bounced") return "undeliverable";
  if (event === "failed" || event === "complained" || event === "unsubscribed" || event === "suppressed") return "failed";
  return null;
};
const rank: Record<string, number> = { recorded: 0, queued: 1, accepted: 2, delivered: 3, read: 4 };
export function canTransitionMessageStatus(current: string, next: string): boolean {
  if (current === "read" || current === next) return false;
  if (next === "failed" || next === "undeliverable") {
    return current !== "delivered" && current !== "read";
  }
  if (current === "failed" || current === "undeliverable") {
    // Out-of-order provider callbacks may confirm delivery after an earlier
    // transient failure. Positive delivery evidence may supersede failure;
    // queued/accepted events never may.
    return next === "delivered" || next === "read";
  }
  if (current === "delivered") return next === "read";
  return (rank[next] ?? -1) >= (rank[current] ?? -1);
}

async function hydrateResendInbound(
  supabase: WebhookClient,
  row: InboxRow,
  event: NormalizedProviderEvent,
): Promise<NormalizedProviderEvent> {
  if (event.body || event.provider !== "resend" || event.direction !== "inbound") return event;
  if (!event.providerMessageId) throw new Error("Inbound Resend event has no received-email ID.");
  const recipient = typeof event.safePayload.recipientAddress === "string" ? event.safePayload.recipientAddress : "";
  if (!recipient) throw new Error("Inbound Resend event has no property recipient address.");
  const { data: binding, error } = await (supabase as any).from("ai_provider_property_bindings")
    .select("credential_secret_ref")
    .eq("property_id", row.property_id).eq("provider", "resend")
    .eq("external_account_id", row.external_account_id).eq("external_endpoint_id", recipient)
    .eq("enabled", true).eq("inbound_enabled", true).eq("verification_status", "verified").maybeSingle();
  if (error || !binding) throw new Error("Verified inbound Resend binding is unavailable for this property.");
  const secretRef = typeof binding.credential_secret_ref === "string" ? binding.credential_secret_ref : "";
  if (!/^STAYNAS_PROVIDER_[A-Z0-9_]{3,100}$/.test(secretRef) || !process.env[secretRef]) {
    throw new Error("The property-bound Resend receiving credential is not provisioned.");
  }
  const { getResendReceivedEmail } = await import("../providers/resend-email.server");
  const received = await getResendReceivedEmail(event.providerMessageId, { config: { apiKey: process.env[secretRef]! } });
  const body = received.text?.trim() || (received.html
    ? received.html.replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').trim()
    : null);
  if (!body) throw new Error("Resend returned no readable inbound email body.");
  const sender = received.from ?? event.externalContact ?? "";
  const emailMatch = sender.match(/<([^<>]+)>/);
  return {
    ...event,
    body,
    subject: received.subject ?? event.subject,
    externalContact: emailMatch?.[1] ?? sender,
    safePayload: { ...event.safePayload, attachmentCount: received.attachments?.length ?? 0 },
  };
}

async function processInbound(supabase: WebhookClient, row: InboxRow, event: NormalizedProviderEvent) {
  const supportedMedia = ["image", "audio", "document", "video", "sticker", "location", "contacts", "interactive", "button", "reaction"].includes(String(event.safePayload.messageType));
  if (!event.providerMessageId) throw new Error("Inbound message has no provider message ID.");
  const externalContact = event.externalContact?.trim();
  if (!externalContact || (!event.body && !supportedMedia)) {
    throw new Error("Inbound message is missing a supported sender or message body.");
  }
  const { data, error } = await (supabase as any).rpc("staynas_process_provider_inbound", {
    p_property_id: row.property_id,
    p_channel: event.channel,
    p_provider: providerName(row.provider),
    p_provider_message_id: event.providerMessageId,
    p_provider_event_id: row.provider_event_id,
    p_external_contact: externalContact,
    p_guest_name: typeof event.safePayload.profileName === "string" ? event.safePayload.profileName : "",
    p_body: event.body ?? "",
    p_subject: event.subject ?? "",
    p_message_type: supportedMedia ? "media" : "text",
    p_occurred_at: event.occurredAt,
    p_safe_payload: event.safePayload as Json,
  });
  if (error) throw new Error("Atomic inbound persistence failed: " + error.message);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.session_id || !result?.message_id) throw new Error("Atomic inbound persistence returned no message linkage.");

  const { data: session, error: sessionError } = await (supabase as any).from("ai_concierge_sessions")
    .select("id,session_token,guest_id")
    .eq("id", result.session_id).eq("property_id", row.property_id).maybeSingle();
  if (sessionError || !session?.session_token) throw new Error("Inbound Concierge session could not be resolved.");
  const preferenceIdentity = session.guest_id
    ? { p_guest_id: session.guest_id, p_session_id: null }
    : { p_guest_id: null, p_session_id: session.id };
  const normalizedContact = event.channel === "email" ? externalContact.toLowerCase() : externalContact;
  const normalizedBody = (event.body ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const stopWords = new Set(["STOP", "STOP ALL", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
  const startWords = new Set(["START", "UNSTOP", "RESUBSCRIBE"]);
  const isOptOut = event.channel === "whatsapp" && stopWords.has(normalizedBody);
  const isReconsent = event.channel === "whatsapp" && startWords.has(normalizedBody);

  if (isOptOut) {
    const { error: suppressionError } = await (supabase as any).from("ai_guest_channel_contact_preferences").upsert({
      property_id: row.property_id, channel: event.channel, external_contact: normalizedContact,
      purpose: "*", consent_status: "withdrawn", consent_source: "guest_action",
      evidence_message_id: result.message_id, captured_at: event.occurredAt,
      withdrawn_at: event.occurredAt, updated_by: null,
    }, { onConflict: "property_id,channel,external_contact,purpose" });
    if (suppressionError) throw new Error("WhatsApp STOP suppression could not be durably recorded.");
    const { error: accountSuppressionError } = await (supabase as any).from("ai_provider_account_suppressions").upsert({
      provider: row.provider, external_account_id: row.external_account_id,
      channel: event.channel, external_contact: normalizedContact, purpose: "*",
      consent_status: "withdrawn", source: "guest_action",
      provider_event_id: row.provider_event_id, captured_at: event.occurredAt,
      withdrawn_at: event.occurredAt,
    }, { onConflict: "provider,external_account_id,channel,external_contact,purpose" });
    if (accountSuppressionError) throw new Error("Provider-account STOP suppression could not be recorded.");
    for (const purpose of ["transactional", "service", "marketing"]) {
      const { error: preferenceError } = await (supabase as any).rpc("staynas_record_guest_channel_preference", {
        p_property_id: row.property_id, ...preferenceIdentity, p_channel: event.channel,
        p_purpose: purpose, p_consent_status: "withdrawn", p_consent_source: "guest_action",
        p_evidence_message_id: result.message_id, p_captured_at: event.occurredAt,
      });
      if (preferenceError) throw new Error("WhatsApp STOP consent withdrawal could not be durably recorded.");
    }
    return { sessionId: result.session_id, messageId: result.message_id };
  }

  if (isReconsent) {
    const { error: suppressionError } = await (supabase as any).from("ai_guest_channel_contact_preferences").upsert({
      property_id: row.property_id, channel: event.channel, external_contact: normalizedContact,
      purpose: "*", consent_status: "granted", consent_source: "guest_action",
      evidence_message_id: result.message_id, captured_at: event.occurredAt,
      withdrawn_at: null, updated_by: null,
    }, { onConflict: "property_id,channel,external_contact,purpose" });
    if (suppressionError) throw new Error("WhatsApp re-consent could not be durably recorded.");
    const { error: accountReconsentError } = await (supabase as any).from("ai_provider_account_suppressions").upsert({
      provider: row.provider, external_account_id: row.external_account_id,
      channel: event.channel, external_contact: normalizedContact, purpose: "*",
      consent_status: "granted", source: "guest_action",
      provider_event_id: row.provider_event_id, captured_at: event.occurredAt,
      withdrawn_at: null,
    }, { onConflict: "provider,external_account_id,channel,external_contact,purpose" });
    if (accountReconsentError) throw new Error("Provider-account re-consent could not be recorded.");
    const { error: preferenceError } = await (supabase as any).rpc("staynas_record_guest_channel_preference", {
      p_property_id: row.property_id, ...preferenceIdentity, p_channel: event.channel,
      p_purpose: "service", p_consent_status: "granted", p_consent_source: "guest_action",
      p_evidence_message_id: result.message_id, p_captured_at: event.occurredAt,
    });
    if (preferenceError) throw new Error("WhatsApp service re-consent could not be durably recorded.");
    return { sessionId: result.session_id, messageId: result.message_id };
  }

  // Inbound initiation grants service-response permission only. A recorded
  // withdrawal is never overwritten by an ordinary new message.
  let preferenceQuery = (supabase as any).from("ai_guest_channel_preferences")
    .select("consent_status").eq("property_id", row.property_id)
    .eq("channel", event.channel).eq("purpose", "service");
  preferenceQuery = session.guest_id
    ? preferenceQuery.eq("guest_id", session.guest_id)
    : preferenceQuery.eq("session_id", session.id);
  const { data: existingPreference, error: preferenceLookupError } = await preferenceQuery.maybeSingle();
  if (preferenceLookupError) throw new Error("Existing channel consent could not be checked.");
  if (!existingPreference) {
    const { error: preferenceError } = await (supabase as any).rpc("staynas_record_guest_channel_preference", {
      p_property_id: row.property_id, ...preferenceIdentity, p_channel: event.channel,
      p_purpose: "service", p_consent_status: "granted", p_consent_source: "inbound_message",
      p_evidence_message_id: result.message_id, p_captured_at: event.occurredAt,
    });
    if (preferenceError) throw new Error("Inbound service-response permission could not be recorded.");
  }

  if (supportedMedia) {
    const mediaType = String(event.safePayload.messageType ?? "media");
    const caption = event.body ? ` Caption: ${event.body.slice(0, 240)}` : "";
    const dedupeKey = createHash("sha256").update([row.property_id, result.session_id, event.providerMessageId, "media-handoff"].join("|")).digest("hex");
    const { error: escalationError } = await (supabase as any).rpc("staynas_create_concierge_escalation", {
      p_property_id: row.property_id, p_session_id: result.session_id,
      p_guest_id: session.guest_id ?? null, p_channel: event.channel,
      p_reason: "complex_request", p_summary: `Guest sent a ${mediaType} message that requires staff review.${caption}`,
      p_ai_confidence: 0, p_priority: 2, p_dedupe_key: dedupeKey,
    });
    if (escalationError) throw new Error("Media-only inbound message could not be routed to staff.");
    return { sessionId: result.session_id, messageId: result.message_id };
  }

  const { data: existingDraft, error: existingDraftError } = await (supabase as any).from("ai_communication_drafts")
    .select("id").eq("source_message_id", result.message_id).maybeSingle();
  if (existingDraftError) throw new Error("Existing Concierge response draft could not be checked.");
  if (!existingDraft) {
    const { handleConciergeChat } = await import("../concierge.server");
    const reply = await handleConciergeChat(
      { message: event.body ?? "", session_token: session.session_token! },
      {
        userAgent: "StayNas provider webhook",
        referer: "provider-inbound",
        channel: event.channel,
        sourceOmnichannelMessageId: result.message_id,
      },
      row.property_id,
    );
    const [{ data: propertySettings }, { data: channelSettings }] = await Promise.all([
      (supabase as any).from("ai_property_channel_settings").select("require_human_approval")
        .eq("property_id", row.property_id).eq("channel", event.channel).maybeSingle(),
      (supabase as any).from("ai_concierge_channels").select("requires_approval")
        .eq("channel", event.channel).maybeSingle(),
    ]);
    const sensitive = /complaint|refund|chargeback|payment|medical|emergency|unsafe|safety|injury|cancel(?:lation)?|legal|dispute/i.test(event.body ?? "");
    const autoApproved = propertySettings?.require_human_approval === false
      && channelSettings?.requires_approval === false
      && reply.message.escalated !== true
      && Number(reply.message.confidence ?? 0) >= 0.85
      && !sensitive;
    const subject = event.channel === "email" ? (event.subject ? `Re: ${event.subject}` : "Re: Your enquiry") : null;
    const { communicationDraftFingerprint } = await import("../draft-fingerprint.server");
    const fingerprint = communicationDraftFingerprint({ subject, body: reply.message.content });
    const now = new Date().toISOString();
    const { error: draftError } = await (supabase as any).from("ai_communication_drafts").upsert({
      session_id: result.session_id, guest_id: session.guest_id ?? null,
      channel: event.channel, draft_type: "concierge_response", subject, body: reply.message.content,
      reasoning: "AI Concierge response generated from a verified inbound provider message.",
      supporting_context: {
        source_provider: event.provider, source_provider_message_id: event.providerMessageId,
        source_omnichannel_message_id: result.message_id,
        ai_confidence: reply.message.confidence ?? null, escalated: reply.message.escalated ?? false,
      },
      status: autoApproved ? "approved" : "pending",
      source_message_id: result.message_id,
      ...(autoApproved ? {
        approved_by: null, approved_by_system: true, approved_at: now,
        approved_content_hash: fingerprint, content_version: 1, approved_content_version: 1,
      } : { approved_by_system: false }),
      created_by: null,
    }, { onConflict: "source_message_id", ignoreDuplicates: true });
    if (draftError) throw new Error("Concierge response draft could not be durably recorded.");
  }
  return { sessionId: result.session_id, messageId: result.message_id };
}

async function processDelivery(supabase: WebhookClient, row: InboxRow, event: NormalizedProviderEvent) {
  const safe = event.safePayload as Record<string, unknown>;
  const externalContact = event.externalContact?.trim();
  const accountSuppressionEvent = safe.accountSuppressionEvent === true;
  if (accountSuppressionEvent) {
    if (!externalContact) throw new Error("Provider account suppression event has no recipient identity.");
    const normalizedContact = event.channel === "email" ? externalContact.toLowerCase() : externalContact;
    const purpose = event.eventType === "unsubscribed" ? "marketing" : "*";
    const { error: accountSuppressionError } = await (supabase as any).from("ai_provider_account_suppressions").upsert({
      provider: row.provider, external_account_id: row.external_account_id,
      channel: event.channel, external_contact: normalizedContact, purpose,
      consent_status: "withdrawn",
      source: event.eventType === "unsubscribed" ? "guest_action" : "provider_suppression",
      provider_event_id: row.provider_event_id, captured_at: event.occurredAt,
      withdrawn_at: event.occurredAt,
    }, { onConflict: "provider,external_account_id,channel,external_contact,purpose" });
    if (accountSuppressionError) throw new Error("Provider-account suppression could not be durably recorded.");
    const { error: propertySuppressionError } = await (supabase as any).from("ai_guest_channel_contact_preferences").upsert({
      property_id: row.property_id, channel: event.channel, external_contact: normalizedContact,
      purpose, consent_status: "withdrawn",
      consent_source: event.eventType === "unsubscribed" ? "guest_action" : "provider_suppression",
      evidence_message_id: null, captured_at: event.occurredAt,
      withdrawn_at: event.occurredAt, updated_by: null,
    }, { onConflict: "property_id,channel,external_contact,purpose" });
    if (propertySuppressionError) throw new Error("Property contact suppression could not be durably recorded.");
    return { ignored: true as const, sessionId: undefined, messageId: undefined };
  }

  if (!event.providerMessageId) throw new Error("Delivery event has no provider message ID.");
  const ledgerProvider = row.provider;
  const { data: message, error } = await supabase.from("ai_omnichannel_messages")
    .select("id,property_id,session_id,guest_id,status")
    .eq("property_id", row.property_id).eq("provider", ledgerProvider)
    .eq("provider_message_id", event.providerMessageId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) throw new Error("Outbound message reference not found yet; provider callback remains retryable.");
  const nextStatus = messageStatus(event.eventType);
  if (nextStatus && canTransitionMessageStatus(message.status, nextStatus)) {
    const { error: updateError } = await supabase.from("ai_omnichannel_messages")
      .update({ status: nextStatus }).eq("id", message.id).eq("property_id", row.property_id);
    if (updateError) throw new Error(updateError.message);
  }
  if (["unsubscribed", "bounced", "complained", "suppressed"].includes(event.eventType)) {
    if (!externalContact) throw new Error("Provider suppression event has no contact identity.");
    const normalizedContact = event.channel === "email" ? externalContact.toLowerCase() : externalContact;
    const purpose = event.eventType === "unsubscribed" ? "marketing" : "*";
    const { error: accountSuppressionError } = await (supabase as any).from("ai_provider_account_suppressions").upsert({
      provider: row.provider, external_account_id: row.external_account_id,
      channel: event.channel, external_contact: normalizedContact, purpose,
      consent_status: "withdrawn",
      source: event.eventType === "unsubscribed" ? "guest_action" : "provider_suppression",
      provider_event_id: row.provider_event_id, captured_at: event.occurredAt,
      withdrawn_at: event.occurredAt,
    }, { onConflict: "provider,external_account_id,channel,external_contact,purpose" });
    if (accountSuppressionError) throw new Error("Provider-account suppression could not be durably recorded.");
    const { error: suppressionError } = await (supabase as any).from("ai_guest_channel_contact_preferences").upsert({
      property_id: row.property_id, channel: event.channel, external_contact: normalizedContact,
      purpose, consent_status: "withdrawn",
      consent_source: event.eventType === "unsubscribed" ? "guest_action" : "provider_suppression",
      evidence_message_id: message.id, captured_at: event.occurredAt,
      withdrawn_at: event.occurredAt, updated_by: null,
    }, { onConflict: "property_id,channel,external_contact,purpose" });
    if (suppressionError) throw new Error("Property contact suppression could not be durably recorded.");
    if (message.guest_id) {
      const purposes = purpose === "*" ? ["transactional", "service", "marketing"] : ["marketing"];
      const { error: guestSuppressionError } = await (supabase as any).from("ai_guest_channel_preferences").upsert(
        purposes.map((consentPurpose) => ({
          property_id: row.property_id, guest_id: message.guest_id, channel: event.channel,
          purpose: consentPurpose, consent_status: "withdrawn",
          consent_source: event.eventType === "unsubscribed" ? "guest_action" : "imported",
          evidence_message_id: message.id, captured_at: event.occurredAt,
          withdrawn_at: event.occurredAt, updated_by: null,
        })),
        { onConflict: "property_id,guest_id,channel,purpose" },
      );
      if (guestSuppressionError) throw new Error("Guest suppression evidence could not be recorded.");
    }
  }
  const { error: eventError } = await supabase.from("ai_omnichannel_delivery_events").upsert({
    property_id: row.property_id, message_id: message.id, channel: event.channel,
    provider: ledgerProvider, provider_event_id: row.provider_event_id,
    provider_message_id: event.providerMessageId, event_type: event.eventType,
    occurred_at: event.occurredAt, payload: event.safePayload as Json,
  }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
  if (eventError) throw new Error(eventError.message);
  return { ignored: false as const, sessionId: message.session_id, messageId: message.id };
}

async function validateProviderBinding(supabase: WebhookClient, row: InboxRow, event: NormalizedProviderEvent) {
  const accountSuppressionEvent = event.safePayload.accountSuppressionEvent === true;
  if (event.safePayload.accountSuppressionEvent === true) {
    const { data: accountBinding, error: accountBindingError } = await (supabase as any).from("ai_provider_property_bindings")
      .select("id").eq("property_id", row.property_id).eq("provider", row.provider)
      .eq("external_account_id", row.external_account_id).eq("enabled", true)
      .eq("outbound_enabled", true).eq("verification_status", "verified").limit(1).maybeSingle();
    if (accountBindingError || !accountBinding) throw new Error("Provider account suppression event has no active verified account binding.");
    return;
  }
  const endpoint = event.provider === "meta_cloud_api"
    ? event.safePayload.phoneNumberId
    : event.direction === "inbound" ? event.safePayload.recipientAddress : event.safePayload.senderAddress;
  if (!accountSuppressionEvent && (typeof endpoint !== "string" || !endpoint)) {
    throw new Error("Provider event has no routable endpoint identity.");
  }
  let query = (supabase as any).from("ai_provider_property_bindings")
    .select("id,channel_id,enabled,inbound_enabled,outbound_enabled,verification_status")
    .eq("property_id", row.property_id).eq("provider", row.provider)
    .eq("external_account_id", row.external_account_id)
    .eq("verification_status", "verified");
  if (accountSuppressionEvent) {
    query = query.eq("enabled", true).eq("outbound_enabled", true);
  } else {
    query = query.eq("external_endpoint_id", endpoint);
    if (event.direction === "inbound") query = query.eq("enabled", true).eq("inbound_enabled", true);
  }
  const { data: binding, error } = await query.maybeSingle();
  if (error || !binding || binding.channel_id !== row.channel_id) {
    throw new Error("Provider event no longer matches a verified property binding.");
  }
}

/**
 * Claims each inbox row once. The unique provider/event key protects webhook
 * intake; the processing status claim protects concurrent workers; message and
 * delivery ledgers retain their own unique provider identifiers as final guards.
 */
export async function processProviderWebhookInbox(supabase: WebhookClient, inboxId: string) {
  const claimTime = new Date();
  const staleBefore = new Date(claimTime.getTime() - 5 * 60 * 1000).toISOString();
  const claimQuery = (supabase as any).from("ai_provider_webhook_inbox");
  const { data: row, error: claimError } = await claimQuery
    .update({ processing_status: "processing", processing_started_at: claimTime.toISOString(), last_error: null, next_retry_at: null })
    .eq("id", inboxId).or(`processing_status.eq.received,and(processing_status.eq.failed,next_retry_at.is.null),and(processing_status.eq.failed,next_retry_at.lte.${claimTime.toISOString()}),and(processing_status.eq.processing,processing_started_at.lt.${staleBefore})`)
    .select("id,property_id,channel_id,provider,external_account_id,provider_event_id,event_type,normalized_event,processing_status,attempt_count")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!row) return { claimed: false, reason: "not_due_or_already_claimed" as const };
  const attemptCount = Number(row.attempt_count ?? 0) + 1;
  const { error: attemptError } = await claimQuery.update({ attempt_count: attemptCount })
    .eq("id", inboxId).eq("processing_status", "processing");
  if (attemptError) throw new Error("Webhook attempt counter could not be persisted.");
  const typed: InboxRow = {
    ...row,
    attempt_count: attemptCount,
    provider: row.provider as Provider,
    normalized_event: row.normalized_event as unknown as NormalizedProviderEvent,
  };
  try {
    const event = typed.normalized_event;
    await validateProviderBinding(supabase, typed, event);
    let result: { sessionId?: string; messageId?: string; ignored?: boolean } = {};
    if (event.eventType === "inbound_message" && event.direction === "inbound") {
      const hydratedEvent = await hydrateResendInbound(supabase, typed, event);
      result = await processInbound(supabase, typed, hydratedEvent);
    } else {
      result = await processDelivery(supabase, typed, event);
    }
    const { error: finishError } = await (supabase as any).from("ai_provider_webhook_inbox").update({
      processing_status: result.ignored ? "ignored" : "processed",
      session_id: result.sessionId ?? null,
      message_id: result.messageId ?? null,
      processed_at: new Date().toISOString(),
      last_error: null,
      next_retry_at: null,
      dead_lettered_at: null,
    }).eq("id", inboxId).eq("property_id", typed.property_id).eq("processing_status", "processing");
    if (finishError) throw new Error(finishError.message);
    return { claimed: true, processed: !result.ignored, ignored: Boolean(result.ignored), sessionId: result.sessionId, messageId: result.messageId };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Unknown inbox processing error";
    const message = rawMessage
      .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(/\+?\d{8,15}/g, "[REDACTED_PHONE]")
      .slice(0, 500);
    const deadLetter = typed.attempt_count >= 5;
    const nextRetryAt = deadLetter ? null : new Date(Date.now() + Math.min(3600, 60 * (2 ** Math.max(0, typed.attempt_count - 1))) * 1000).toISOString();
    await (supabase as any).from("ai_provider_webhook_inbox").update({
      processing_status: deadLetter ? "dead_letter" : "failed",
      last_error: message,
      next_retry_at: nextRetryAt,
      dead_lettered_at: deadLetter ? new Date().toISOString() : null,
    }).eq("id", inboxId).eq("property_id", typed.property_id).eq("processing_status", "processing");
    throw error;
  }
}
