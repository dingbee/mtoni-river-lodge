import { describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "./contracts";
import {
  createDistributionCredentialResolver,
  type DistributionCredentialRpcArgs,
} from "./credential-broker.server";

const context: AdapterExecutionContext = Object.freeze({
  organisationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  connectionId: "50000000-0000-4000-8000-000000000005",
  providerKey: "sample_ota",
  externalAccountReference: "acct-demo-17",
  environment: "sandbox",
  operation: "availability.pull",
  capability: "availability.read",
  correlationId: "corr-dc04-credential-1",
  adapterVersion: "1.2.0",
});

describe("DC-04 server credential broker", () => {
  it("binds Vault resolution to the authorized connection, tenant, property and environment", async () => {
    let received: DistributionCredentialRpcArgs | undefined;
    const rpc = vi.fn(async (args: DistributionCredentialRpcArgs) => {
      received = args;
      return { data: "provider-secret-test-value", error: null };
    });
    const resolved = await createDistributionCredentialResolver(rpc)(context);

    expect(received).toEqual({
      _connection_id: context.connectionId,
      _organisation_id: context.organisationId,
      _property_id: context.propertyId,
      _provider_key: context.providerKey,
      _external_account_reference: context.externalAccountReference,
      _environment: context.environment,
      _capability: context.capability,
      _correlation_id: context.correlationId,
    });
    expect(resolved).toMatchObject({
      connectionId: context.connectionId,
      providerKey: context.providerKey,
      environment: "sandbox",
      secret: "provider-secret-test-value",
    });
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it("does not disclose database error details", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: new Error("sensitive database detail"),
    }));
    await expect(createDistributionCredentialResolver(rpc)(context))
      .rejects.toThrow("Distribution credential resolution was denied or unavailable.");
  });

  it("rejects empty or malformed secret payloads", async () => {
    const emptyRpc = vi.fn(async () => ({ data: "", error: null }));
    await expect(createDistributionCredentialResolver(emptyRpc)(context))
      .rejects.toThrow(/invalid secret payload/);
    const objectRpc = vi.fn(async () => ({ data: { secret: "leak" }, error: null }));
    await expect(createDistributionCredentialResolver(objectRpc)(context))
      .rejects.toThrow(/invalid secret payload/);
  });

  it("rejects incomplete execution context before calling Vault", async () => {
    const rpc = vi.fn(async () => ({ data: "secret", error: null }));
    const invalid = { ...context, connectionId: "" } as AdapterExecutionContext;
    await expect(createDistributionCredentialResolver(rpc)(invalid))
      .rejects.toThrow(/context is incomplete/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
