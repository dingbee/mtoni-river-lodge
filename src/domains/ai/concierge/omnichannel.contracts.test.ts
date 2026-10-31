import { describe, expect, it } from "vitest";
import {
  channelConsentInputSchema,
  deliveryEventInputSchema,
  dispatchAttemptInputSchema,
  guestIdentityLinkInputSchema,
  omnichannelMessageInputSchema,
} from "./omnichannel.contracts";

const propertyId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const guestId = "33333333-3333-4333-8333-333333333333";
const messageId = "44444444-4444-4444-8444-444444444444";
const now = "2026-10-30T12:00:00.000Z";
const digest = "a".repeat(64);

describe("SN-IQ-04 omnichannel contracts", () => {
  it("accepts property-scoped inbound WhatsApp text", () => {
    expect(omnichannelMessageInputSchema.safeParse({
      propertyId, sessionId, guestId, channel: "whatsapp", direction: "inbound",
      actorType: "guest", body: "Hello", clientMessageId: "wamid:unique-message-001",
    }).success).toBe(true);
  });

  it("rejects an inbound message attributed to the assistant", () => {
    expect(omnichannelMessageInputSchema.safeParse({
      propertyId, sessionId, channel: "web", direction: "inbound",
      actorType: "assistant", body: "Hello",
    }).success).toBe(false);
  });

  it("requires body content for text messages", () => {
    expect(omnichannelMessageInputSchema.safeParse({
      propertyId, sessionId, channel: "email", direction: "outbound",
      actorType: "staff",
    }).success).toBe(false);
  });

  it("accepts verified identity links only with a keyed digest shape", () => {
    expect(guestIdentityLinkInputSchema.safeParse({
      propertyId, guestId, channel: "email", identifierType: "email",
      identifierHash: digest, verificationMethod: "magic_link", verifiedAt: now,
    }).success).toBe(true);
    expect(guestIdentityLinkInputSchema.safeParse({
      propertyId, guestId, channel: "email", identifierType: "email",
      identifierHash: "guest@example.com", verificationMethod: "magic_link", verifiedAt: now,
    }).success).toBe(false);
  });

  it("requires affirmative guest-origin consent for marketing", () => {
    const base = {
      propertyId, guestId, channel: "email", purpose: "marketing",
      consentStatus: "granted", capturedAt: now,
    };
    expect(channelConsentInputSchema.safeParse({ ...base, consentSource: "guest_action" }).success).toBe(true);
    expect(channelConsentInputSchema.safeParse({ ...base, consentSource: "staff_recorded" }).success).toBe(false);
  });

  it("requires a withdrawal timestamp for withdrawn consent", () => {
    expect(channelConsentInputSchema.safeParse({
      propertyId, guestId, channel: "whatsapp", purpose: "marketing",
      consentStatus: "withdrawn", consentSource: "guest_action", capturedAt: now,
    }).success).toBe(false);
  });

  it("rejects dispatch attempts for rejected drafts", () => {
    expect(dispatchAttemptInputSchema.safeParse({
      propertyId, sessionId, messageId, channel: "email", provider: "resend",
      idempotencyKey: "staynas-dispatch-key-0001", attemptNumber: 1,
      approvalStatus: "rejected", requestFingerprint: digest,
    }).success).toBe(false);
  });

  it("requires approver evidence when approval is required", () => {
    const base = {
      propertyId, sessionId, messageId, channel: "whatsapp", provider: "meta_cloud_api",
      idempotencyKey: "staynas-dispatch-key-0002", attemptNumber: 1,
      requestFingerprint: digest, approvalStatus: "approved",
    };
    expect(dispatchAttemptInputSchema.safeParse(base).success).toBe(false);
    expect(dispatchAttemptInputSchema.safeParse({
      ...base, approvedBy: guestId, approvedAt: now,
    }).success).toBe(true);
  });

  it("accepts provider delivery events and requires a provider event id", () => {
    const base = {
      propertyId, messageId, channel: "email", provider: "resend",
      providerEventId: "evt_123", eventType: "delivered", occurredAt: now,
    };
    expect(deliveryEventInputSchema.safeParse(base).success).toBe(true);
    expect(deliveryEventInputSchema.safeParse({ ...base, providerEventId: "" }).success).toBe(false);
  });
});
