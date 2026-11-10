import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolvePublicDirectBookingChannel } from "./public-booking-channel.server";
import { newBookingSessionId } from "./booking-session";

type Fixture = {
  domain?: Record<string, unknown> | null;
  channel?: Record<string, unknown> | null;
  property?: Record<string, unknown> | null;
};

function fakeSupabase(fixture: Fixture) {
  const queries = new Map<string, { eq: ReturnType<typeof vi.fn>; not: ReturnType<typeof vi.fn> }>();
  const rows: Record<string, unknown> = {
    staynas_property_domains: fixture.domain ?? null,
    staynas_public_booking_channels: fixture.channel ?? null,
    staynas_properties: fixture.property ?? null,
  };
  const client = {
    from: vi.fn((table: string) => {
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        not: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: rows[table] ?? null, error: null })),
      };
      queries.set(table, query);
      return query;
    }),
  };
  return { client, queries };
}

const validFixture: Fixture = {
  domain: {
    id: "11111111-1111-4111-8111-111111111111",
    property_id: "22222222-2222-4222-8222-222222222222",
    hostname: "cdma-uat.example.test",
    verification_status: "verified",
    verified_at: "2026-11-10T06:00:00.000Z",
  },
  channel: {
    id: "33333333-3333-4333-8333-333333333333",
    property_id: "22222222-2222-4222-8222-222222222222",
    domain_id: "11111111-1111-4111-8111-111111111111",
    channel_code: "direct_web",
    route_path: "/book",
    transaction_currency: "USD",
    status: "published",
  },
  property: {
    id: "22222222-2222-4222-8222-222222222222",
    organisation_id: "44444444-4444-4444-8444-444444444444",
    status: "active",
  },
};

describe("resolvePublicDirectBookingChannel", () => {
  it("resolves only the exact verified Nolmark CDMA host and published /book channel", async () => {
    const { client, queries } = fakeSupabase(validFixture);
    const result = await resolvePublicDirectBookingChannel(client as any, "CDMA-UAT.EXAMPLE.TEST:443");

    expect(result).toEqual({
      propertyId: validFixture.domain?.property_id,
      organisationId: validFixture.property?.organisation_id,
      channelId: validFixture.channel?.id,
      channelCode: "direct_web",
      currency: "USD",
      domainId: validFixture.domain?.id,
      hostname: "cdma-uat.example.test",
    });
    expect(queries.get("staynas_property_domains")?.eq).toHaveBeenCalledWith("hostname", "cdma-uat.example.test");
    expect(queries.get("staynas_property_domains")?.eq).toHaveBeenCalledWith("verification_status", "verified");
    expect(queries.get("staynas_property_domains")?.not).toHaveBeenCalledWith("verified_at", "is", null);
    expect(queries.get("staynas_public_booking_channels")?.eq).toHaveBeenCalledWith("route_path", "/book");
    expect(queries.get("staynas_public_booking_channels")?.eq).toHaveBeenCalledWith("status", "published");
  });

  it("rejects malformed hosts before querying the database", async () => {
    const { client } = fakeSupabase(validFixture);
    await expect(resolvePublicDirectBookingChannel(client as any, "https://cdma-uat.example.test"))
      .rejects.toThrow("Public booking host is invalid");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not fall back to the founder or UAT tenant for an unknown host", async () => {
    const { client, queries } = fakeSupabase({});
    await expect(resolvePublicDirectBookingChannel(client as any, "nolmarkcdma.staynas.com"))
      .rejects.toThrow("This domain is not verified for public booking");
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(queries.has("staynas_properties")).toBe(false);
  });

  it("rejects a missing or unpublished direct-booking channel", async () => {
    const { client } = fakeSupabase({ ...validFixture, channel: null });
    await expect(resolvePublicDirectBookingChannel(client as any, "cdma-uat.example.test"))
      .rejects.toThrow("The official direct-booking channel is not published");
  });

  it("rejects an inactive property even when the host and channel are valid", async () => {
    const { client } = fakeSupabase({
      ...validFixture,
      property: { ...validFixture.property, status: "setup" },
    });
    await expect(resolvePublicDirectBookingChannel(client as any, "cdma-uat.example.test"))
      .rejects.toThrow("The property is not accepting public bookings");
  });

  it("rejects a channel currency that is not an ISO currency code", async () => {
    const { client } = fakeSupabase({
      ...validFixture,
      channel: { ...validFixture.channel, transaction_currency: "USDX" },
    });
    await expect(resolvePublicDirectBookingChannel(client as any, "cdma-uat.example.test"))
      .rejects.toThrow("Public booking channel has no valid transaction currency");
  });
});

describe("Tenant-neutral payment-pending booking contract", () => {
  it("does not invoke Pesapal from the direct booking route or reservation server function", () => {
    const route = readFileSync(new URL("../routes/book.tsx", import.meta.url), "utf8");
    const booking = readFileSync(new URL("./booking.functions.ts", import.meta.url), "utf8");
    expect(route).not.toContain("initiatePayment");
    expect(route).not.toContain("begin_payment");
    expect(booking).not.toContain("getActivePropertyPesapalAccount");
    expect(booking).toContain('_payment_method: "pay_at_property"');
    expect(booking).toContain('paymentState: "not_configured"');
  });


  it("uses a high-entropy session token accepted by the inventory hold RPC", () => {
    expect(newBookingSessionId().length).toBeGreaterThanOrEqual(24);
    const session = readFileSync(new URL("./booking-session.tsx", import.meta.url), "utf8");
    const route = readFileSync(new URL("../routes/book.tsx", import.meta.url), "utf8");
    expect(session).not.toContain("Math.random");
    expect(route).toContain("/^[a-zA-Z0-9_-]{24,120}$/");
  });

  it("keeps rate-plan transaction currency independent of property operating currency", () => {
    const ratePlanFunctions = readFileSync(new URL("../domains/finance/rate-plans.functions.ts", import.meta.url), "utf8");
    const ratePlanPage = readFileSync(new URL("../routes/_authenticated.admin.finance.rate-plans.tsx", import.meta.url), "utf8");
    expect(ratePlanFunctions).toContain("let ratePlanCurrency = String(data.currency ?? property.currency).toUpperCase()");
    expect(ratePlanFunctions).toContain("validateSeasonalRateCurrency(effectiveSeasonalRates, ratePlanCurrency)");
    expect(ratePlanFunctions).toContain("currency: ratePlanCurrency");
    expect(ratePlanPage).toContain("Guest transaction currency");
    expect(ratePlanPage).not.toContain("Currency is inherited from the active property and cannot be overridden");
  });

  it("does not cache TanStack server-function responses in the service worker", () => {
    const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
    expect(vite).toContain('url.pathname.startsWith("/_serverFn")');
    expect(vite).toContain('handler: "NetworkOnly"');
    expect(vite).not.toContain('cacheName: "staynas-server-fn"');
  });
});
