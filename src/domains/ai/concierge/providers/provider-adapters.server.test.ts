import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderAdapterError } from "./provider-http.server";
import { sendWhatsAppText } from "./meta-whatsapp.server";
import { sendResendEmail } from "./resend-email.server";

const metaConfig = {
  accessToken: "meta-test-secret",
  phoneNumberId: "123456789012345",
  graphApiVersion: "v23.0",
};
const resendConfig = { apiKey: "re_test_secret" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Meta WhatsApp Cloud API adapter", () => {
  it("authenticates with the Meta bearer token and returns the provider message id", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test-123" }] }), { status: 200 }),
    );
    const result = await sendWhatsAppText({
      to: "+255712345678",
      text: "Hello",
      idempotencyKey: "staynas-dispatch-key-0001",
    }, { config: metaConfig, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/123456789012345/messages");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer meta-test-secret");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "255712345678",
      type: "text",
      text: { body: "Hello", preview_url: false },
    });
    expect(result.providerMessageId).toBe("wamid.test-123");
  });

  it("rejects non-E.164 recipients before making a provider request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(sendWhatsAppText({
      to: "0712345678",
      text: "Hello",
      idempotencyKey: "staynas-dispatch-key-0001",
    }, { config: metaConfig, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when Meta credentials are missing", async () => {
    await expect(sendWhatsAppText({
      to: "+255712345678",
      text: "Hello",
      idempotencyKey: "staynas-dispatch-key-0001",
    }, { config: { phoneNumberId: metaConfig.phoneNumberId, graphApiVersion: metaConfig.graphApiVersion } }))
      .rejects.toMatchObject({ code: "provider_not_configured" });
  });

  it("classifies Meta rate limits as retryable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 4, message: "Rate limit" } }), { status: 429 }),
    );
    try {
      await sendWhatsAppText({
        to: "+255712345678",
        text: "Hello",
        idempotencyKey: "staynas-dispatch-key-0001",
      }, { config: metaConfig, fetchImpl });
      throw new Error("Expected Meta adapter to reject.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderAdapterError);
      expect(error).toMatchObject({ provider: "meta_cloud_api", status: 429, retryable: true });
    }
  });
});

describe("Resend email adapter", () => {
  it("uses bearer authentication and a provider idempotency key", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "re_123" }), { status: 200 }),
    );
    const result = await sendResendEmail({
      from: "StayNas <bookings@example.com>",
      to: "guest@example.com",
      subject: "Booking update",
      text: "Your booking is being processed.",
      idempotencyKey: "staynas-dispatch-key-0002",
    }, { config: resendConfig, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer re_test_secret");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("staynas-dispatch-key-0002");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: "StayNas <bookings@example.com>",
      to: "guest@example.com",
      subject: "Booking update",
      text: "Your booking is being processed.",
    });
    expect(result.providerMessageId).toBe("re_123");
  });

  it("requires an email body and does not call Resend for invalid input", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(sendResendEmail({
      from: "StayNas <bookings@example.com>",
      to: "guest@example.com",
      subject: "Booking update",
      idempotencyKey: "staynas-dispatch-key-0002",
    }, { config: resendConfig, fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the Resend API key is missing", async () => {
    await expect(sendResendEmail({
      from: "StayNas <bookings@example.com>",
      to: "guest@example.com",
      subject: "Booking update",
      text: "Update",
      idempotencyKey: "staynas-dispatch-key-0002",
    }, { config: {} })).rejects.toMatchObject({ code: "provider_not_configured" });
  });

  it("classifies Resend server errors as retryable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "Temporary failure" }), { status: 503 }),
    );
    await expect(sendResendEmail({
      from: "StayNas <bookings@example.com>",
      to: "guest@example.com",
      subject: "Booking update",
      text: "Update",
      idempotencyKey: "staynas-dispatch-key-0002",
    }, { config: resendConfig, fetchImpl })).rejects.toMatchObject({
      provider: "resend",
      status: 503,
      retryable: true,
    });
  });
});
