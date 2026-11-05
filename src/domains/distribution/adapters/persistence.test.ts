import { describe, expect, it } from "vitest";
import { resolvePersistedAdapterExecution } from "./persistence";
import type { AdapterManifest, DistributionCapability, DistributionEnvironment } from "./contracts";

const ids = {
  organisation: "10000000-0000-4000-8000-000000000001",
  property: "20000000-0000-4000-8000-000000000002",
  account: "30000000-0000-4000-8000-000000000003",
  grant: "40000000-0000-4000-8000-000000000004",
  connection: "50000000-0000-4000-8000-000000000005",
  user: "60000000-0000-4000-8000-000000000006",
};

const manifest: AdapterManifest = {
  providerKey: "sample_ota",
  adapterVersion: "1.2.0",
  contractVersion: "1.0",
  capabilities: ["availability.read", "reservation.import"],
  environments: ["sandbox"],
  authenticationModes: ["managed_secret"],
  supportsHealthCheck: false,
};

const base = () => ({
  principal: { userId: ids.user, active: true, platformAdmin: false },
  connection: {
    id: ids.connection,
    organisation_id: ids.organisation,
    property_id: ids.property,
    account_grant_id: ids.grant,
    external_account_id: ids.account,
    provider_key: "sample_ota",
    adapter_version: "1.2.0",
    environment: "sandbox",
    lifecycle: "connected",
  },
  accountGrant: {
    id: ids.grant,
    organisation_id: ids.organisation,
    property_id: ids.property,
    external_account_id: ids.account,
    provider_key: "sample_ota",
    environment: "sandbox",
    grant_status: "active",
    granted_capabilities: ["availability.read"],
  },
  externalAccount: {
    id: ids.account,
    organisation_id: ids.organisation,
    provider_key: "sample_ota",
    external_account_reference: "acct-demo-17",
    environment: "sandbox",
    credential_reference: "vault://distribution/sample-ota/demo",
    lifecycle: "connected",
  },
  propertyMembership: {
    userId: ids.user,
    organisationId: ids.organisation,
    propertyId: ids.property,
    active: true,
    canManageDistribution: true,
  },
  manifest,
  capability: "availability.read" as DistributionCapability,
  environment: "sandbox" as DistributionEnvironment,
  operation: "availability.pull",
  correlationId: "corr-dc04-1",
});

describe("persisted adapter execution resolution", () => {
  it("builds an immutable tenant-scoped context without returning credential references", () => {
    const context = resolvePersistedAdapterExecution(base());
    expect(context).toMatchObject({
      organisationId: ids.organisation,
      propertyId: ids.property,
      connectionId: ids.connection,
      externalAccountReference: "acct-demo-17",
      environment: "sandbox",
      capability: "availability.read",
    });
    expect(context).not.toHaveProperty("credentialReference");
    expect(context).not.toHaveProperty("credential_reference");
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("rejects a connection linked to a different grant", () => {
    const input = base();
    input.connection.account_grant_id = ids.account;
    expect(() => resolvePersistedAdapterExecution(input)).toThrow(/scope do not match/);
  });

  it("rejects a grant for another property", () => {
    const input = base();
    input.accountGrant.property_id = "70000000-0000-4000-8000-000000000007";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow(/scope do not match/);
  });

  it("rejects an external account owned by another organisation", () => {
    const input = base();
    input.externalAccount.organisation_id = "70000000-0000-4000-8000-000000000007";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow(/scope do not match/);
  });

  it("rejects a revoked grant", () => {
    const input = base();
    input.accountGrant.grant_status = "revoked";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow(/does not permit/);
  });

  it("rejects a capability absent from the explicit grant", () => {
    const input = base();
    input.capability = "reservation.import";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow(/does not permit/);
  });

  it("rejects a disconnected external account", () => {
    const input = base();
    input.externalAccount.lifecycle = "suspended";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow(/not connected/);
  });

  it("rejects an environment mismatch", () => {
    const input = base();
    input.environment = "live";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow();
  });

  it("rejects malformed persisted records before authorization", () => {
    const input = base();
    input.connection.id = "not-a-uuid";
    expect(() => resolvePersistedAdapterExecution(input)).toThrow();
  });
});
