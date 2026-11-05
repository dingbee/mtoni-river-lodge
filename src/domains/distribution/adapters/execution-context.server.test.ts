import { describe, expect, it, vi } from "vitest";
import { createTrustedDistributionExecutionLoader, type DistributionExecutionRepository } from "./execution-context.server";
import { DistributionAdapterRegistry } from "./registry";
import type { DistributionAdapter } from "./contracts";

const manifest = {
  providerKey: "test_provider",
  adapterVersion: "1.0.0",
  contractVersion: "1.0",
  capabilities: ["availability.read"] as const,
  environments: ["sandbox"] as const,
  authenticationModes: ["managed_secret"] as const,
  supportsHealthCheck: false,
};

function makeRepository(overrides: Partial<DistributionExecutionRepository> = {}) {
  const rows = {
    getAuthenticatedPrincipal: vi.fn(async () => ({ id: "user-1" })),
    getConnection: vi.fn(async () => ({
      id: "connection-1",
      organisation_id: "org-1",
      property_id: "property-1",
      account_grant_id: "grant-1",
      external_account_id: "account-1",
      provider_key: "test_provider",
      adapter_version: "1.0.0",
      environment: "sandbox",
      lifecycle: "connected",
    })),
    getAccountGrant: vi.fn(async () => ({
      id: "grant-1",
      organisation_id: "org-1",
      property_id: "property-1",
      external_account_id: "account-1",
      provider_key: "test_provider",
      environment: "sandbox",
      grant_status: "active",
      granted_capabilities: ["availability.read"],
    })),
    getExternalAccount: vi.fn(async () => ({
      id: "account-1",
      organisation_id: "org-1",
      provider_key: "test_provider",
      external_account_reference: "external-a",
      environment: "sandbox",
      credential_reference: "40000000-0000-4000-8000-000000000001",
      lifecycle: "connected",
    })),
    getProperty: vi.fn(async () => ({ organisation_id: "org-1" })),
    getPropertyMembership: vi.fn(async () => ({
      property_id: "property-1",
      user_id: "user-1",
      role: "manager",
      status: "active",
    })),
    ...overrides,
  } as DistributionExecutionRepository;
  return rows;
}

function makeRegistry() {
  const registry = new DistributionAdapterRegistry({ supportedContractVersions: ["1.0"] });
  registry.register({ manifest } as DistributionAdapter);
  return registry;
}

describe("trusted distribution execution context loader", () => {
  it("loads auth and scope records server-side before producing a context", async () => {
    const repository = makeRepository();
    const load = createTrustedDistributionExecutionLoader(repository, makeRegistry());
    const context = await load({
      accessToken: "verified-session-token",
      connectionId: "connection-1",
      capability: "availability.read",
      environment: "sandbox",
      operation: "availability.pull",
      correlationId: "correlation-1",
    });

    expect(context).toMatchObject({
      organisationId: "org-1",
      propertyId: "property-1",
      connectionId: "connection-1",
      providerKey: "test_provider",
      externalAccountReference: "external-a",
      environment: "sandbox",
    });
    expect(repository.getAuthenticatedPrincipal).toHaveBeenCalledWith("verified-session-token");
    expect(repository.getPropertyMembership).toHaveBeenCalledWith("property-1", "user-1");
  });

  it("fails closed when no active property membership exists", async () => {
    const repository = makeRepository({
      getPropertyMembership: vi.fn(async () => null),
    });
    const load = createTrustedDistributionExecutionLoader(repository, makeRegistry());
    await expect(load({
      accessToken: "verified-session-token",
      connectionId: "connection-1",
      capability: "availability.read",
      environment: "sandbox",
      operation: "availability.pull",
      correlationId: "correlation-2",
    })).rejects.toThrow("Distribution adapter execution was denied");
  });

  it("rejects anonymous or banned principals", async () => {
    const repository = makeRepository({
      getAuthenticatedPrincipal: vi.fn(async () => ({ id: "user-1", is_anonymous: true })),
    });
    const load = createTrustedDistributionExecutionLoader(repository, makeRegistry());
    await expect(load({
      accessToken: "anonymous-session-token",
      connectionId: "connection-1",
      capability: "availability.read",
      environment: "sandbox",
      operation: "availability.pull",
      correlationId: "correlation-3",
    })).rejects.toThrow("unavailable for this principal");
  });
});
