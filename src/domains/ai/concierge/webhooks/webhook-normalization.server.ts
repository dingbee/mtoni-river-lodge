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
  eventType: "inbound_message" | "sent" | "delivered" | "read" | "failed" | "bounced" | "complained" | "unsubscribed";
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
        events.push({
          provider: "meta_cloud_api", providerEventId: "wa:message:" + id,
          providerMessageId: id, channel: "whatsapp", eventType: "inbound_message",
          direction: "inbound", occurredAt: isoDate(Number(m.timestamp) * 1000, receivedAt),
          externalContact: stringValue(m.from), body: stringValue(text.body),
          subject: null,
          safePayload: { phoneNumberId: stringValue(metadata.phone_number_id), messageType: stringValue(m.type), profileName: stringValue(profile.name) },
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
          safePayload: { conversationId: stringValue((s.conversation as Record<string, unknown> | undefined)?.id), errorCount: errors.length },
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
  if (!id) return [];
  const map: Record<string, NormalizedProviderEvent["eventType"]> = {
    "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "bounced",
    "email.delivery_delayed": "failed", "email.complained": "complained",
  };
  const eventType = map[event.type];
  if (!eventType) return [];
  const to = Array.isArray(data.to) ? data.to[0] : data.to;
  return [{
    provider: "resend", providerEventId: webhookId, providerMessageId: id,
    channel: "email", eventType, direction: "outbound",
    occurredAt: isoDate(event.created_at, receivedAt),
    externalContact: stringValue(to), body: null, subject: stringValue(data.subject),
    safePayload: { eventType: event.type, from: stringValue(data.from) },
  }];
}
