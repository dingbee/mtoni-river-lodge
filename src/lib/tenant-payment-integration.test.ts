import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTenantPaymentContext } from "./tenant-payment-integration.server";
import { resolvePaymentSecretReference, MTONI_PROPERTY_ID } from "./payment-context.server";

const MTONI = MTONI_PROPERTY_ID;
const OTHER = "f44ff48a-5449-4464-b0cb-83295fadb468";

function fakeSupabase(row: Record<string, unknown> | null) {
  const filters: Array<[string, unknown]> = [];
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return builder; }),
    maybeSingle: vi.fn(async () => {
      const propertyFilter = filters.find(([key]) => key === "property_id")?.[1];
      const providerFilter = filters.find(([key]) => key === "provider")?.[1];
      const integrationFilter = filters.find(([key]) => key === "id")?.[1];
      if (!row || row.property_id !== propertyFilter) return { data: null, error: null };
      if (providerFilter && row.provider !== providerFilter) return { data: null, error: null };
      if (integrationFilter && row.id !== integrationFilter) return { data: null, error: null };
      return { data: row, error: null };
    }),
  };
  return { client: { from: vi.fn(() => builder) } as any, filters };
}

describe("tenant payment integration resolution", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("scopes provider lookup to the requested property before resolving secrets", async () => {
    const { client, filters } = fakeSupabase({
      id: "integration-mtoni",
      property_id: MTONI,
      provider: "pesapal",
      purpose: "payments",
      enabled: true,
      environment: "sandbox",
      credential_reference: "env://mtoni-official-pesapal",
      public_config: {},
    });
    const resolveSecretReference = vi.fn(async () => ({ consumer_key: "key", consumer_secret: "secret" }));
    const context = await resolveTenantPaymentContext(client, {
      propertyId: MTONI,
      provider: "pesapal",
      currency: "USD",
      callbackBaseUrl: "https://mtoni.example",
      resolveSecretReference,
    });
    expect(context.propertyId).toBe(MTONI);
    expect(context.integrationId).toBe("integration-mtoni");
    expect(filters).toContainEqual(["property_id", MTONI]);
    expect(resolveSecretReference).toHaveBeenCalledWith("env://mtoni-official-pesapal");
  });

  it("rejects an integration belonging to another property without resolving its secrets", async () => {
    const { client } = fakeSupabase({
      id: "integration-other",
      property_id: OTHER,
      provider: "pesapal",
      purpose: "payments",
      enabled: true,
      environment: "live",
      credential_reference: "env://mtoni-official-pesapal",
      public_config: {},
    });
    const resolveSecretReference = vi.fn(async () => ({ consumer_key: "key", consumer_secret: "secret" }));
    await expect(resolveTenantPaymentContext(client, {
      propertyId: MTONI,
      provider: "pesapal",
      currency: "USD",
      callbackBaseUrl: "https://mtoni.example",
      resolveSecretReference,
    })).rejects.toThrow("No enabled payment integration matches this property");
    expect(resolveSecretReference).not.toHaveBeenCalled();
  });

  it("never permits Mtoni's official Pesapal credential reference for another tenant", async () => {
    vi.stubEnv("PESAPAL_CONSUMER_KEY", "test-key");
    vi.stubEnv("PESAPAL_CONSUMER_SECRET", "test-secret");
    await expect(resolvePaymentSecretReference("env://mtoni-official-pesapal", OTHER))
      .rejects.toThrow("cannot be used by another property");
  });

  it("fails closed when the Mtoni credential reference is used but credentials are absent", async () => {
    vi.stubEnv("PESAPAL_CONSUMER_KEY", "");
    vi.stubEnv("PESAPAL_CONSUMER_SECRET", "");
    await expect(resolvePaymentSecretReference("env://mtoni-official-pesapal", MTONI))
      .rejects.toThrow("not available in the server secret environment");
  });

  it("does not accept arbitrary or unknown secret references", async () => {
    await expect(resolvePaymentSecretReference("env://some-other-tenant", MTONI))
      .rejects.toThrow("Unknown credential reference");
  });
});
