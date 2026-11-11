import { createHash } from "node:crypto";
import { z } from "zod";

const isoDate = (value: unknown, fallback: string) => {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};
const stringValue = (value: unknown): string | null => typeof value === "string" && value.length ? value : null;

export interface NormalizedProviderEvent {
  provider: "meta_cloud_api" | "resend";
  providerEventId: string;
  providerMessageId: string | null;
  channel: "whatsapp" | "email";
  eventType: "inbound_message" | "sent" | "delivered" | "read" | "failed" | "bounced" | "complained" | "unsubscribed" | "delivery_delayed" | "suppressed";
  direction: "inbound" | "outbound";
  occurredAt: string;
  externalContact: string | null;
  body: string | null;
  subject: string | null;
  safePayload: Record<string, unknown>;
}

function stableId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeMetaWebhook(payload: unknown, receivedAt = new Date().toISOString()): NormalizedProviderEvent[] {
  const root = z.record(z.string(), z.unknown()).parse(payload);
  const events: NormalizedProviderEvent[] = [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as Record<string, unknown>).changes) ? (entry as Record<string, unknown>).changes as unknown[] : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;
      const data = value as Record<string, unknown>;
      const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : {};
      const messages = Array.isArray(data.messages) ? data.messages : [];
      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        const m = message as Record<string, unknown>;
        const id = stringValue(m.id);
        if (!id) continue;
        const contact = Array.isArray(data.contacts) ? data.contacts[0] as Record<string, unknown> | undefined : undefined;
        const profile = contact?.profile && typeof contact.profile === "object" ? contact.profile as Record<string, unknown> : {};
        const text = m.text && typeof m.text === "object" ? m.text as Record<string, unknown> : {};
        const messageType = stringValue(m.type) ?? "unknown";
        const media = m[messageType] && typeof m[messageType] === "object" ? m[messageType] as Record<string, unknown> : {};
        const body = stringValue(text.body) ?? stringValue(media.caption);
        events.push({
          provider: "meta_cloud_api", providerEventId: "wa:message:" + id,
          providerMessageId: id, channel: "whatsapp", eventType: "inbound_message",
          direction: "inbound", occurredAt: isoDate(Number(m.timestamp) * 1000, receivedAt),
          externalContact: stringValue(m.from), body,
          subject: null,
          safePayload: {
            phoneNumberId: stringValue(metadata.phone_number_id),
            messageType,
            profileName: stringValue(profile.name),
            mediaId: stringValue(media.id),
            mediaMimeType: stringValue(media.mime_type),
            mediaFileName: stringValue(media.filename),
            caption: stringValue(media.caption),
          },
        });
      }
      const statuses = Array.isArray(data.statuses) ? data.statuses : [];
      for (const status of statuses) {
        if (!status || typeof status !== "object") continue;
        const s = status as Record<string, unknown>;
        const id = stringValue(s.id);
        const state = stringValue(s.status);
        if (!id || !state || !["sent", "delivered", "read", "failed"].includes(state)) continue;
        const errors = Array.isArray(s.errors) ? s.errors : [];
        events.push({
          provider: "meta_cloud_api", providerEventId: "wa:status:" + stableId(s),
          providerMessageId: id, channel: "whatsapp", eventType: state as NormalizedProviderEvent["eventType"],
          direction: "outbound", occurredAt: isoDate(Number(s.timestamp) * 1000, receivedAt),
          externalContact: stringValue(s.recipient_id), body: null, subject: null,
          safePayload: { phoneNumberId: stringValue(metadata.phone_number_id), conversationId: stringValue((s.conversation as Record<string, unknown> | undefined)?.id), errorCount: errors.length },
        });
      }
    }
  }
  return events;
}

const resendEventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

export function normalizeResendWebhook(payload: unknown, webhookId: string, receivedAt = new Date().toISOString()): NormalizedProviderEvent[] {
  const event = resendEventSchema.parse(payload);
  const data = event.data;
  const id = stringValue(data.email_id) ?? stringValue(data.id);
  const contactUnsubscribed = event.type === "contact.updated" && data.unsubscribed === true;
  const suppressionAdded = event.type === "suppression.added";
  const map: Record<string, NormalizedProviderEvent["eventType"]> = {
    "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "bounced",
    "email.delivery_delayed": "delivery_delayed", "email.complained": "complained",
    "email.unsubscribed": "unsubscribed", "email.failed": "failed",
    "email.suppressed": "suppressed", "email.received": "inbound_message",
    "contact.updated": "unsubscribed", "suppression.added": "suppressed",
  };
  const eventType = map[event.type];
  if (!eventType || (event.type === "contact.updated" && !contactUnsubscribed) ||
      (!id && !contactUnsubscribed && !suppressionAdded)) return [];
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  const inbound = eventType === "inbound_message";
  const from = stringValue(data.from);
  const senderMatch = from?.match(/<([^<>]+)>/);
  const senderAddress = senderMatch?.[1]?.trim() ?? from;
  const recipientRaw = stringValue(to) ?? stringValue(data.email);
  const recipientMatch = recipientRaw?.match(/<([^<>]+)>/);
  const recipientAddress = recipientMatch?.[1]?.trim() ?? recipientRaw;
  const accountSuppressionEvent = contactUnsubscribed || suppressionAdded;
  return [{
    provider: "resend", providerEventId: webhookId,
    providerMessageId: accountSuppressionEvent ? null : id,
    channel: "email", eventType, direction: inbound ? "inbound" : "outbound",
    occurredAt: isoDate(event.created_at, receivedAt),
    externalContact: inbound ? senderAddress : recipientAddress,
    body: inbound ? stringValue(data.text) : null,
    subject: stringValue(data.subject),
    safePayload: { eventType: event.type, from, recipientAddress, senderAddress, accountSuppressionEvent },
  }];
}
