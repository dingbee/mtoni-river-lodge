import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensurePesapalPropertyAccountIpn,
  getPesapalPropertyAccountToken,
  getPesapalPropertyAccountTransactionStatus,
  submitPesapalPropertyAccountOrder,
  testPesapalPropertyAccount,
} from "./pesapal.server";

const credentials = (suffix: string) => ({
  consumer_key: `property-key-${suffix}`,
  consumer_secret: `property-secret-${suffix}`,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("property-scoped Pesapal adapter", () => {
  it("authenticates with the selected property's credentials and environment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      token: "property-token",
      expiryDate: new Date(Date.now() + 300_000).toISOString(),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testPesapalPropertyAccount(
      { consumerKey: "camel-key", consumerSecret: "camel-secret" },
      "sandbox",
    );

    expect(result).toEqual({ ok: true, provider: "pesapal", environment: "sandbox" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("cybqa.pesapal.com");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      consumer_key: "camel-key",
      consumer_secret: "camel-secret",
    });
  });

  it("does not reuse an IPN registration from another property account", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "token-a",
        expiryDate: new Date(Date.now() + 300_000).toISOString(),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ipn_id: "ipn-account-a" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensurePesapalPropertyAccountIpn(
      "https://mtoni.example",
      credentials("ipn-a"),
      "sandbox",
    );

    expect(result).toEqual({
      ipnId: "ipn-account-a",
      ipnUrl: "https://mtoni.example/api/public/pesapal/ipn",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/URLSetup/RegisterIPN");
  });

  it("reuses only the IPN ID explicitly stored on the same property account", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensurePesapalPropertyAccountIpn(
      "https://mtoni.example",
      credentials("ipn-existing"),
      "live",
      "ipn-from-this-account",
    );

    expect(result.ipnId).toBe("ipn-from-this-account");
    expect(result.ipnUrl).toBe("https://mtoni.example/api/public/pesapal/ipn");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits an order using the selected account token and transaction currency", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "token-order",
        expiryDate: new Date(Date.now() + 300_000).toISOString(),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        order_tracking_id: "track-123",
        merchant_reference: "MR-123",
        redirect_url: "https://checkout.example/123",
        status: "200",
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitPesapalPropertyAccountOrder({
      merchantReference: "MR-123",
      amount: 260,
      currency: "USD",
      description: "Mtoni direct booking",
      callbackUrl: "https://mtoni.example/booking/return",
      notificationId: "ipn-mtoni",
      email: "guest@example.com",
    }, credentials("order"), "live");

    expect(result.order_tracking_id).toBe("track-123");
    expect(String(fetchMock.mock.calls[1][0])).toContain("pay.pesapal.com");
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toMatchObject({ id: "MR-123", amount: 260, currency: "USD", notification_id: "ipn-mtoni" });
  });

  it("queries transaction status with the same property account credentials", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "token-status",
        expiryDate: new Date(Date.now() + 300_000).toISOString(),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status_code: 1, amount: 260, currency: "USD", payment_method: "Visa",
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const status = await getPesapalPropertyAccountTransactionStatus(
      "track/with spaces",
      credentials("status"),
      "sandbox",
    );

    expect(status.status_code).toBe(1);
    expect(String(fetchMock.mock.calls[1][0])).toContain("orderTrackingId=track%2Fwith%20spaces");
  });

  it("caches tokens by property credential identity rather than sharing a global token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "token-one",
        expiryDate: new Date(Date.now() + 300_000).toISOString(),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        token: "token-two",
        expiryDate: new Date(Date.now() + 300_000).toISOString(),
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const one = await getPesapalPropertyAccountToken(credentials("one"), "sandbox");
    const two = await getPesapalPropertyAccountToken(credentials("two"), "sandbox");

    expect(one).toBe("token-one");
    expect(two).toBe("token-two");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
