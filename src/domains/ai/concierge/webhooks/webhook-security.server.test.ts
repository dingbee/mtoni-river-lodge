import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaWebhookSignature, verifyResendWebhookSignature } from "./webhook-signatures.server";
import { normalizeMetaWebhook, normalizeResendWebhook } from "./webhook-normalization.server";

describe("Meta webhook verification", () => {
  it("verifies the exact raw body", () => {
    const body = '{"object":"whatsapp_business_account"}';
    const signature = "sha256=" + createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(verifyMetaWebhookSignature(body, signature, "app-secret")).toBe(true);
    expect(verifyMetaWebhookSignature(body + " ", signature, "app-secret")).toBe(false);
  });
  it("rejects missing and malformed signatures", () => {
    expect(verifyMetaWebhookSignature("{}", null, "secret")).toBe(false);
    expect(verifyMetaWebhookSignature("{}", "sha256=bad", "secret")).toBe(false);
  });
});

describe("Resend Svix verification", () => {
  it("verifies a signed event and rejects stale timestamps", () => {
    const body = '{"type":"email.delivered","data":{"email_id":"em_1"}}';
    const id = "msg_123", timestamp = "1700000000", secret = "whsec_" + Buffer.from("signing-secret").toString("base64");
    const signed = id + "." + timestamp + "." + body;
    const digest = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(signed).digest("base64");
    const headers = { id, timestamp, signature: "v1," + digest };
    expect(verifyResendWebhookSignature(body, headers, secret, { nowSeconds: 1700000000 })).toBe(true);
    expect(verifyResendWebhookSignature(body, headers, secret, { nowSeconds: 1700001000 })).toBe(false);
  });
});

describe("provider event normalization", () => {
  it("normalizes WhatsApp inbound messages with provider phone mapping metadata", () => {
    const events = normalizeMetaWebhook({ entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "123" }, contacts: [{ profile: { name: "Guest" } }],
      messages: [{ id: "wamid.1", from: "255700000000", timestamp: "1700000000", type: "text", text: { body: "Hello" } }],
    } }] }] }, "2023-11-14T22:13:20.000Z");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ providerEventId: "wa:message:wamid.1", direction: "inbound", body: "Hello" });
    expect(events[0].safePayload.phoneNumberId).toBe("123");
  });
  it("normalizes Resend delivery events and ignores unsupported events", () => {
    const event = normalizeResendWebhook({ type: "email.delivered", created_at: "2025-01-01T00:00:00Z", data: { email_id: "em_1", to: ["guest@example.com"] } }, "svix_1");
    expect(event[0]).toMatchObject({ providerEventId: "svix_1", eventType: "delivered", providerMessageId: "em_1" });
    expect(normalizeResendWebhook({ type: "email.opened", data: { email_id: "em_1" } }, "svix_2")).toEqual([]);
  });
});
