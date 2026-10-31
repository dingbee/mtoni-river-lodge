import type { NormalizedProviderEvent } from "./webhook-normalization.server";

export interface ProviderPropertyMapping {
  propertyId: string;
  channelId: string;
  provider: "meta_cloud_api" | "resend";
  externalAccountId: string;
  enabled: boolean;
}

/**
 * The persistence adapter must implement insert-on-conflict-do-nothing using the
 * unique (provider, provider_event_id) key and return whether the event was new.
 * Property resolution is based only on trusted founder-managed mappings.
 */
export interface WebhookPersistence {
  resolveMetaPhoneNumber(phoneNumberId: string): Promise<ProviderPropertyMapping | null>;
  resolveResendAccount(accountId: string): Promise<ProviderPropertyMapping | null>;
  persistOnce(input: {
    propertyId: string;
    channelId: string;
    event: NormalizedProviderEvent;
    externalAccountId: string;
  }): Promise<{ inserted: boolean }>;
}

export async function persistMetaEvents(
  events: NormalizedProviderEvent[],
  persistence: WebhookPersistence,
): Promise<{ accepted: number; duplicates: number; rejected: number }> {
  let accepted = 0, duplicates = 0, rejected = 0;
  for (const event of events) {
    const phoneNumberId = typeof event.safePayload.phoneNumberId === "string" ? event.safePayload.phoneNumberId : null;
    if (!phoneNumberId) { rejected++; continue; }
    const mapping = await persistence.resolveMetaPhoneNumber(phoneNumberId);
    if (!mapping || !mapping.enabled || mapping.provider !== "meta_cloud_api") { rejected++; continue; }
    const result = await persistence.persistOnce({
      propertyId: mapping.propertyId, channelId: mapping.channelId, event,
      externalAccountId: mapping.externalAccountId,
    });
    if (result.inserted) accepted++; else duplicates++;
  }
  return { accepted, duplicates, rejected };
}

export async function persistResendEvents(
  events: NormalizedProviderEvent[],
  accountId: string,
  persistence: WebhookPersistence,
): Promise<{ accepted: number; duplicates: number; rejected: number }> {
  const mapping = await persistence.resolveResendAccount(accountId);
  if (!mapping || !mapping.enabled || mapping.provider !== "resend") {
    return { accepted: 0, duplicates: 0, rejected: events.length };
  }
  let accepted = 0, duplicates = 0;
  for (const event of events) {
    const result = await persistence.persistOnce({
      propertyId: mapping.propertyId, channelId: mapping.channelId, event,
      externalAccountId: mapping.externalAccountId,
    });
    if (result.inserted) accepted++; else duplicates++;
  }
  return { accepted, duplicates, rejected: 0 };
}
