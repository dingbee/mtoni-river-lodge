import { describe, expect, it } from "vitest";
import { DistributionAdapterRegistry } from "./registry";
import type { DistributionAdapter } from "./contracts";

function mockAdapter(overrides: Partial<DistributionAdapter["manifest"]> = {}): DistributionAdapter {
  return {
    manifest: {
      providerKey: "mock_channel",
      adapterVersion: "1.0.0",
      contractVersion: "1.0",
      capabilities: ["listing.read", "connection.health"],
      environments: ["sandbox"],
      authenticationModes: ["managed_secret"],
      supportsHealthCheck: true,
      ...overrides,
    },
    healthCheck: async () => ({
      ok: true,
      value: { state: "healthy", checkedAt: "2026-11-05T00:00:00.000Z", latencyMs: 12 },
    }),
  };
}

describe("DistributionAdapterRegistry", () => {
  it("registers and resolves an adapter by provider and exact version", () => {
    const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
    const adapter = mockAdapter();
    registry.register(adapter);
    expect(registry.resolve("mock_channel", "1.0.0")).toBe(adapter);
  });

  it("rejects duplicate provider/version registrations", () => {
    const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
    registry.register(mockAdapter());
    expect(() => registry.register(mockAdapter())).toThrow(/already registered/);
  });

  it("rejects adapters using an unsupported StayNas contract version", () => {
    const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
    expect(() => registry.register(mockAdapter({ contractVersion: "2.0" }))).toThrow(/not supported/);
  });

  it("rejects capabilities that the adapter does not declare", () => {
    const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
    registry.register(mockAdapter());
    expect(() => registry.assertCapability("mock_channel", "1.0.0", "reservation.import", "sandbox"))
      .toThrow(/does not declare/);
  });

  it("rejects an environment that the adapter does not support", () => {
    const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
    registry.register(mockAdapter());
    expect(() => registry.assertCapability("mock_channel", "1.0.0", "listing.read", "live"))
      .toThrow(/does not support/);
  });

  it("requires an implementation when connection.health is declared", () => {
    const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
    const adapter = mockAdapter();
    const missingHealth = { manifest: adapter.manifest } as DistributionAdapter;
    expect(() => registry.register(missingHealth)).toThrow(/no healthCheck/);
  });
});
