import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canTransitionMessageStatus, messageStatus } from "./webhook-processor.server";
import { normalizeMetaWebhook, normalizeResendWebhook } from "./webhook-normalization.server";
import {
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  verifyResendWebhookSignature,
} from "./webhook-signatures.server";

describe("provider delivery state projection", () => {
  it.each([
    ["sent", "accepted"],
    ["delivered", "delivered"],
    ["read", "read"],
    ["bounced", "undeliverable"],
    ["failed", "failed"],
    ["complained", "failed"],
    ["unsubscribed", "failed"],
  ] as const)("maps %s to %s", (event, expected) => {
    expect(messageStatus(event)).toBe(expected);
  });
  it("does not project inbound message events onto outbound delivery state", () => {
    expect(messageStatus("inbound_message")).toBeNull();
  });
});

describe("delivery status transition safety", () => {
  it("does not allow late failures to downgrade delivered or read messages", () => {
    expect(canTransitionMessageStatus("delivered", "failed")).toBe(false);
    expect(canTransitionMessageStatus("read", "undeliverable")).toBe(false);
  });
  it("allows delivery progress and terminal failure before confirmation", () => {
    expect(canTransitionMessageStatus("accepted", "delivered")).toBe(true);
    expect(canTransitionMessageStatus("accepted", "failed")).toBe(true);
    expect(canTransitionMessageStatus("failed", "delivered")).toBe(true);
  });
  it("does not regress a confirmed read state", () => {
    expect(canTransitionMessageStatus("read", "accepted")).toBe(false);
  });
  it("only permits positive delivery confirmation to supersede a failure", () => {
    expect(canTransitionMessageStatus("failed", "accepted")).toBe(false);
    expect(canTransitionMessageStatus("undeliverable", "queued")).toBe(false);
    expect(canTransitionMessageStatus("failed", "delivered")).toBe(true);
    expect(canTransitionMessageStatus("undeliverable", "read")).toBe(true);
  });
});


describe("provider inbound event normalization", () => {
  it("preserves WhatsApp media identity and caption for human escalation", () => {
    const events = normalizeMetaWebhook({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "123456789" },
            contacts: [{ profile: { name: "Guest" } }],
            messages: [{
              id: "wamid.test-001", from: "255700000001", timestamp: "1794326400",
              type: "image", image: { id: "media-001", mime_type: "image/jpeg", caption: "Please identify this room." },
            }],
          },
        }],
      }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].body).toBe("Please identify this room.");
    expect(events[0].safePayload).toMatchObject({
      phoneNumberId: "123456789", messageType: "image", mediaId: "media-001",
      mediaMimeType: "image/jpeg", profileName: "Guest",
    });
  });

  it("normalizes inbound Resend sender identity without requiring email body in the webhook", () => {
    const events = normalizeResendWebhook({
      type: "email.received",
      created_at: "2026-11-10T10:00:00.000Z",
      data: {
        id: "re_received_12345678", from: "Guest Name <Guest@Example.com>",
        to: ["bookings@example.test"], subject: "Booking enquiry",
      },
    }, "whk_received_001");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      direction: "inbound", eventType: "inbound_message",
      providerMessageId: "re_received_12345678", externalContact: "Guest@Example.com",
      body: null,
    });
  });

  it("represents Resend account-level suppression events without an email message ID", () => {
    const events = normalizeResendWebhook({
      type: "suppression.added",
      created_at: "2026-11-10T10:00:00.000Z",
      data: { email: "guest@example.com" },
    }, "whk_suppression_001");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      direction: "outbound", eventType: "suppressed",
      providerMessageId: null, externalContact: "guest@example.com",
      safePayload: { accountSuppressionEvent: true },
    });
  });
});


describe("provider webhook authentication", () => {
  it("validates Meta HMAC signatures against the exact raw body", () => {
    const rawBody = '{"object":"whatsapp_business_account"}';
    const appSecret = "test-meta-app-secret";
    const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    expect(verifyMetaWebhookSignature(rawBody, `sha256=${digest}`, appSecret)).toBe(true);
    expect(verifyMetaWebhookSignature(rawBody + " ", `sha256=${digest}`, appSecret)).toBe(false);
  });

  it("compares Meta webhook challenge tokens without accepting mismatches", () => {
    expect(verifyMetaWebhookChallenge("challenge-token", "challenge-token")).toBe(true);
    expect(verifyMetaWebhookChallenge("challenge-token", "different-token")).toBe(false);
    expect(verifyMetaWebhookChallenge(null, "challenge-token")).toBe(false);
  });

  it("validates Svix signatures and rejects stale Resend webhook timestamps", () => {
    const rawBody = '{"type":"email.delivered"}';
    const id = "whk_test_001";
    const timestamp = "1794326400";
    const key = Buffer.from("resend-webhook-test-secret");
    const secret = `whsec_${key.toString("base64")}`;
    const signed = Buffer.from(`${id}.${timestamp}.${rawBody}`, "utf8");
    const digest = createHmac("sha256", key).update(signed).digest("base64");
    const headers = { id, timestamp, signature: `v1,${digest}` };
    expect(verifyResendWebhookSignature(rawBody, headers, secret, { nowSeconds: Number(timestamp) })).toBe(true);
    expect(verifyResendWebhookSignature(rawBody, headers, secret, { nowSeconds: Number(timestamp) + 1000 })).toBe(false);
  });
});
