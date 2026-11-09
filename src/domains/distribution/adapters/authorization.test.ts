import { describe, expect, it } from "vitest";
import { authorizeAdapterExecution, AdapterAuthorizationError } from "./authorization";
import type { AdapterExecutionAuthorizationInput } from "./authorization";

const base: AdapterExecutionAuthorizationInput = {
  principal: { userId: "user-1", active: true, platformAdmin: false },
  connection: {
    id: "connection-1",
    organisationId: "org-1",
    propertyId: "property-1",
    externalAccountId: "external-account-1",
    providerKey: "mock_channel",
    adapterVersion: "1.0.0",
    environment: "sandbox",
    lifecycle: "connected",
    credentialReference: "vault-ref-1",
  },
  propertyMembership: {
    userId: "user-1",
    organisationId: "org-1",
    propertyId: "property-1",
    active: true,
    canManageDistribution: true,
  },
  accountGrant: {
    externalAccountId: "external-account-1",
    organisationId: "org-1",
    propertyId: "property-1",
    active: true,
    canUseForDistribution: true,
  },
  manifest: {
    providerKey: "mock_channel",
    adapterVersion: "1.0.0",
    contractVersion: "1.0",
    capabilities: ["listing.read", "connection.health"],
    environments: ["sandbox"],
    authenticationModes: ["managed_secret"],
    supportsHealthCheck: true,
  },
  capability: "listing.read",
  environment: "sandbox",
  operation: "read_listing",
  correlationId: "corr-1",
};

describe("adapter execution tenant authorization", () => {
  it("builds context from the persisted connection and matching grants", () => {
    const context = authorizeAdapterExecution(base);
    expect(context.propertyId).toBe("property-1");
    expect(context.organisationId).toBe("org-1");
    expect(context.connectionId).toBe("connection-1");
    expect(Object.keys(context)).not.toContain("credentialReference");
  });

  it("rejects inactive principals", () => {
    expect(() => authorizeAdapterExecution({
      ...base, principal: { ...base.principal, active: false },
    })).toThrow(AdapterAuthorizationError);
  });

  it("rejects cross-tenant property membership", () => {
    expect(() => authorizeAdapterExecution({
      ...base,
      propertyMembership: { ...base.propertyMembership!, organisationId: "org-other" },
    })).toThrow(/denied/);
  });

  it("rejects a grant for another property even when the account matches", () => {
    expect(() => authorizeAdapterExecution({
      ...base,
      accountGrant: { ...base.accountGrant, propertyId: "property-other" },
    })).toThrow(/denied/);
  });

  it("rejects an environment mismatch", () => {
    expect(() => authorizeAdapterExecution({ ...base, environment: "live" })).toThrow(/denied/);
  });

  it("rejects degraded/suspended connections and missing credential references", () => {
    expect(() => authorizeAdapterExecution({
      ...base, connection: { ...base.connection, lifecycle: "degraded" },
    })).toThrow(/denied/);
    expect(() => authorizeAdapterExecution({
      ...base, connection: { ...base.connection, lifecycle: "suspended" },
    })).toThrow(/denied/);
    expect(() => authorizeAdapterExecution({
      ...base, connection: { ...base.connection, credentialReference: null },
    })).toThrow(/denied/);
  });

  it("requires exact account and property grants even for platform administrators", () => {
    expect(() => authorizeAdapterExecution({
      ...base,
      principal: { ...base.principal, platformAdmin: true },
      propertyMembership: null,
      accountGrant: { ...base.accountGrant, organisationId: "org-other" },
    })).toThrow(/denied/);
  });

  it("allows platform administrators only after connection and account grant checks", () => {
    const context = authorizeAdapterExecution({
      ...base,
      principal: { ...base.principal, platformAdmin: true },
      propertyMembership: null,
    });
    expect(context.propertyId).toBe("property-1");
  });

  it("allows pending-validation connections only for the health capability", () => {
    const healthInput: AdapterExecutionAuthorizationInput = {
      ...base,
      connection: { ...base.connection, lifecycle: "pending_validation" },
      capability: "connection.health",
      operation: "connection.health",
    };
    expect(authorizeAdapterExecution(healthInput).connectionId).toBe("connection-1");
    expect(() => authorizeAdapterExecution({
      ...healthInput,
      capability: "listing.read",
      operation: "listing.read",
    })).toThrow(AdapterAuthorizationError);
  });
});
