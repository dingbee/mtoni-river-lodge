import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantPaymentContext } from "./payment-provider.contract";
import { payinAdapter } from "./payment-providers/payin.adapter.server";

const context: TenantPaymentContext = {
  propertyId: "property-a", integrationId: "integration-a", provider: "payin",
  environment: "sandbox", currency: "TZS", callbackBaseUrl: "https://staynas.example",
  credentials: { api_key: "test-key", api_secret: "test-secret", webhook_secret: "test-webhook-secret" },
  publicConfig: {},
};
const input = {
  bookingId: "booking-a", bookingReference: "BOOK-A", merchantReference: "STAYNAS-A-ATTEMPT-1",
  amount: 25000, currency: "TZS", description: "Sandbox booking",
  guest: { email: "guest@example.com", phone: "+255 712 345 678" },
  returnUrl: "https://staynas.example/return", callbackUrl: "https://staynas.example/api/public/payin/ipn",
};
afterEach(() => vi.unstubAllGlobals());

describe("PayIn mobile-money adapter", () => {
  it("declares mobile money only, sandbox/live, status checks and signed webhooks", () => {
    expect(payinAdapter.capabilities).toEqual({
      methods: ["mobile_money"], environments: ["sandbox", "live"],
      supportsStatusCheck: true, supportsRefunds: false, supportsWebhook: true,
    });
  });
  it("creates TZS collection with tenant credentials and stable idempotency", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, request_ref: "PAY123", status: "processing", amount: 25000, currency: "TZS",
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await payinAdapter.createIntent(context, input);
    expect(result).toMatchObject({ provider: "payin", providerTransactionId: "PAY123", status: "pending", amount: 25000, currency: "TZS" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sandbox.payin.co.tz/api/v1/collection");
    expect(new Headers(init.headers).get("X-API-Key")).toBe("test-key");
    expect(new Headers(init.headers).get("X-Idempotency-Key")).toBe(input.merchantReference);
    expect(JSON.parse(String(init.body))).toMatchObject({ phone: "255712345678", amount: 25000, currency: "TZS" });
  });
  it("fails closed for wrong provider, currency, invalid phone and amount", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(payinAdapter.createIntent({ ...context, provider: "other" }, input)).rejects.toThrow(/different provider/);
    await expect(payinAdapter.createIntent({ ...context, currency: "USD" }, input)).rejects.toThrow(/require TZS/);
    await expect(payinAdapter.createIntent(context, { ...input, amount: 10.5 })).rejects.toThrow(/whole shilling/);
    await expect(payinAdapter.createIntent(context, { ...input, amount: 99 })).rejects.toThrow(/between TZS/);
    await expect(payinAdapter.createIntent(context, { ...input, guest: { email: "g@example.com", phone: "0712345678" } })).rejects.toThrow(/255XXXXXXXXX/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("redacts provider error payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "private detail" }), { status: 422 })));
    await expect(payinAdapter.createIntent(context, input)).rejects.toThrow("PayIn request failed (422)");
  });
  it("maps status and rejects malformed provider references", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      request_ref: "PAY123", external_ref: input.merchantReference, status: "completed",
      gross_amount: 25000, currency: "TZS", operator: "M-Pesa", receipt_number: "MPI123",
    }), { status: 200 })));
    await expect(payinAdapter.getStatus(context, "PAY123")).resolves.toMatchObject({
      status: "completed", amount: 25000, currency: "TZS", providerReference: "MPI123",
    });
    await expect(payinAdapter.getStatus(context, "../tenant-b")).rejects.toThrow(/Invalid PayIn transaction/);
  });
  it("verifies HMAC over exact raw body and rejects forged or stale signatures", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event: "payin.completed", request_ref: "PAY123",
      external_ref: input.merchantReference, status: "completed", gross_amount: 25000, currency: "TZS" });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("test-webhook-secret"),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + body)));
    const signature = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const good = new Request("https://staynas.example/hook", { method: "POST",
      headers: { "x-payin-timestamp": timestamp, "x-payin-signature": signature }, body });
    await expect(payinAdapter.verifyWebhook!(context, good)).resolves.toMatchObject({
      status: "completed", amount: 25000, merchantReference: input.merchantReference,
    });
    const bad = new Request("https://staynas.example/hook", { method: "POST",
      headers: { "x-payin-timestamp": timestamp, "x-payin-signature": "bad" }, body });
    await expect(payinAdapter.verifyWebhook!(context, bad)).rejects.toThrow(/Invalid PayIn webhook signature/);
    const stale = new Request("https://staynas.example/hook", { method: "POST",
      headers: { "x-payin-timestamp": "1", "x-payin-signature": signature }, body });
    await expect(payinAdapter.verifyWebhook!(context, stale)).rejects.toThrow(/timestamp/);
  });
});
