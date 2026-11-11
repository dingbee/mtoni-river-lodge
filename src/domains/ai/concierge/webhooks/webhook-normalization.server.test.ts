import { describe, expect, it } from "vitest";
import { normalizeResendWebhook } from "./webhook-normalization.server";

describe("Resend suppression webhook normalization", () => {
  it("normalizes contact unsubscribe as an account-scoped suppression without a message ID", () => {
    const [event] = normalizeResendWebhook({
      type: "contact.updated",
      created_at: "2026-11-10T12:00:00.000Z",
      data: { id: "contact_123", email: "Guest@Example.com", unsubscribed: true },
    }, "svix-contact-123", "2026-11-10T12:00:01.000Z");

    expect(event).toMatchObject({
      provider: "resend",
      providerEventId: "svix-contact-123",
      providerMessageId: null,
      channel: "email",
      eventType: "unsubscribed",
      direction: "outbound",
      externalContact: "Guest@Example.com",
    });
    expect(event.safePayload.accountSuppressionEvent).toBe(true);
  });

  it("normalizes a provider suppression without requiring an outbound message reference", () => {
    const [event] = normalizeResendWebhook({
      type: "suppression.added",
      created_at: "2026-11-10T12:00:00.000Z",
      data: { id: "suppression_123", email: "guest@example.com" },
    }, "svix-suppression-123", "2026-11-10T12:00:01.000Z");

    expect(event.providerMessageId).toBeNull();
    expect(event.eventType).toBe("suppressed");
    expect(event.externalContact).toBe("guest@example.com");
    expect(event.safePayload.accountSuppressionEvent).toBe(true);
  });

  it("does not treat a contact update that preserves subscription as an unsubscribe", () => {
    expect(normalizeResendWebhook({
      type: "contact.updated",
      created_at: "2026-11-10T12:00:00.000Z",
      data: { id: "contact_123", email: "guest@example.com", unsubscribed: false },
    }, "svix-contact-124", "2026-11-10T12:00:01.000Z")).toEqual([]);
  });

  it("retains the provider message ID for delivery callbacks", () => {
    const [event] = normalizeResendWebhook({
      type: "email.delivered",
      created_at: "2026-11-10T12:00:00.000Z",
      data: { email_id: "re_123", from: "StayNas <bookings@example.com>", to: ["guest@example.com"] },
    }, "svix-delivered-123", "2026-11-10T12:00:01.000Z");

    expect(event.providerMessageId).toBe("re_123");
    expect(event.eventType).toBe("delivered");
    expect(event.externalContact).toBe("guest@example.com");
  });
});
