import { randomBytes } from "node:crypto";
import type { NormalizedProviderEvent } from "./webhook-normalization.server";

type InboxRow = {
  id: string; property_id: string; channel_id: string | null; provider: "meta_cloud_api" | "resend";
  external_account_id: string; provider_event_id: string; event_type: string;
  normalized_event: NormalizedProviderEvent; processing_status: string;
};

const providerName = (provider: InboxRow["provider"]) => provider === "meta_cloud_api" ? "meta_cloud_api" : "resend";
const messageStatus = (event: NormalizedProviderEvent["eventType"]) => {
  if (event === "sent") return "accepted";
  if (event === "delivered") return "delivered";
  if (event === "read") return "read";
  if (event === "bounced") return "undeliverable";
  if (event === "failed" || event === "complained" || event === "unsubscribed") return "failed";
  return null;
};
const rank: Record<string, number> = { recorded: 0, queued: 1, accepted: 2, delivered: 3, read: 4, failed: 5, undeliverable: 5 };

async function processInbound(supabase: any, row: InboxRow, event: NormalizedProviderEvent) {
  if (!event.externalContact || (!event.body && event.safePayload.messageType !== "image" && event.safePayload.messageType !== "audio" && event.safePayload.messageType !== "document" && event.safePayload.messageType !== "video")) {
    throw new Error("Inbound message is missing a supported sender or message body.");
  }
  const sessionToken = "cnc_" + randomBytes(32).toString("base64url");
  const { data: session, error: sessionError } = await supabase.from("ai_concierge_sessions").insert({
    session_token: sessionToken,
    property_id: row.property_id,
    locale: "en",
    guest_name: typeof event.safePayload.profileName === "string" ? event.safePayload.profileName.slice(0, 160) : null,
    guest_phone: event.channel === "whatsapp" ? event.externalContact : null,
    referer: "provider:" + row.provider,
    page_context: { channel: event.channel, provider: row.provider },
    message_count: 1,
    last_active_at: event.occurredAt,
  }).select("id").single();
  if (sessionError || !session) throw new Error("Could not create property-scoped conversation: " + (sessionError?.message ?? "missing session"));
  const messageType = event.body ? "text" : "media";
  const { data: existingMessage, error: existingError } = await supabase.from("ai_omnichannel_messages")\n    .select("id").eq("property_id", row.property_id).eq("channel", event.channel)\n    .eq("provider", providerName(row.provider)).eq("provider_message_id", event.providerMessageId).maybeSingle();\n  if (existingError) throw new Error(existingError.message);\n  if (existingMessage) return { sessionId: (await supabase.from("ai_omnichannel_messages").select("session_id").eq("id", existingMessage.id).single()).data.session_id as string, messageId: existingMessage.id as string };\n  const { data: message, error: messageError } = await supabase.from("ai_omnichannel_messages").insert({
    property_id: row.property_id, session_id: session.id, guest_id: null,
    channel: event.channel, direction: "inbound", actor_type: "provider",
    message_type: messageType, subject: event.subject, body: event.body,
    provider: providerName(row.provider), provider_message_id: event.providerMessageId,
    status: "recorded", occurred_at: event.occurredAt,
    metadata: { externalContact: event.externalContact, providerEventId: row.provider_event_id, safePayload: event.safePayload },
  }).select("id").single();
  if (messageError || !message) throw new Error("Could not materialize inbound message: " + (messageError?.message ?? "missing message"));
  return { sessionId: session.id as string, messageId: message.id as string };
}

async function processDelivery(supabase: any, row: InboxRow, event: NormalizedProviderEvent) {
  if (!event.providerMessageId) throw new Error("Delivery event has no provider message ID.");
  const { data: message, error } = await supabase.from("ai_omnichannel_messages")
    .select("id,property_id,session_id,status")
    .eq("property_id", row.property_id)
    .eq("provider", providerName(row.provider))
    .eq("provider_message_id", event.providerMessageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!message) return { ignored: true as const };
  const nextStatus = messageStatus(event.eventType);
  if (nextStatus && (rank[nextStatus] ?? 0) >= (rank[message.status] ?? 0)) {
    const { error: updateError } = await supabase.from("ai_omnichannel_messages")
      .update({ status: nextStatus })
      .eq("id", message.id).eq("property_id", row.property_id);
    if (updateError) throw new Error(updateError.message);
  }
  const { error: eventError } = await supabase.from("ai_omnichannel_delivery_events").upsert({
    property_id: row.property_id, message_id: message.id, channel: event.channel,
    provider: providerName(row.provider), provider_event_id: row.provider_event_id,
    provider_message_id: event.providerMessageId, event_type: event.eventType,
    occurred_at: event.occurredAt, payload: event.safePayload,
  }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
  if (eventError) throw new Error(eventError.message);
  return { ignored: false as const, sessionId: message.session_id as string, messageId: message.id as string };
}

/**
 * Claims each inbox row once. The unique provider/event key protects webhook
 * intake; the processing status claim protects concurrent workers; message and
 * delivery ledgers retain their own unique provider identifiers as final guards.
 */
export async function processProviderWebhookInbox(supabase: any, inboxId: string) {
  const { data: row, error: claimError } = await supabase.from("ai_provider_webhook_inbox")
    .update({ processing_status: "processing", processing_started_at: new Date().toISOString(), last_error: null })
    .eq("id", inboxId).or(`processing_status.in.(received,failed),and(processing_status.eq.processing,processing_started_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()})`)
    .select("id,property_id,channel_id,provider,external_account_id,provider_event_id,event_type,normalized_event,processing_status")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!row) return { claimed: false, reason: "already_claimed_or_processed" as const };
  const typed = row as InboxRow;
  try {
    const event = typed.normalized_event;
    let result: { sessionId?: string; messageId?: string; ignored?: boolean } = {};
    if (event.eventType === "inbound_message" && event.direction === "inbound") {
      result = await processInbound(supabase, typed, event);
    } else {
      result = await processDelivery(supabase, typed, event);
    }
    const { error: finishError } = await supabase.from("ai_provider_webhook_inbox").update({
      processing_status: result.ignored ? "ignored" : "processed",
      session_id: result.sessionId ?? null,
      message_id: result.messageId ?? null,
      processed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", inboxId).eq("property_id", typed.property_id).eq("processing_status", "processing");
    if (finishError) throw new Error(finishError.message);
    return { claimed: true, processed: !result.ignored, ignored: Boolean(result.ignored), sessionId: result.sessionId, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown inbox processing error";
    await supabase.from("ai_provider_webhook_inbox").update({
      processing_status: "failed", last_error: message,
    }).eq("id", inboxId).eq("property_id", typed.property_id).eq("processing_status", "processing");
    throw error;
  }
}
