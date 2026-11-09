import { z } from "zod";
import {
  distributionCapabilitySchema,
  distributionEnvironmentSchema,
  validateAdapterManifest,
  type AdapterExecutionContext,
  type AdapterManifest,
  type DistributionCapability,
  type DistributionEnvironment,
} from "./contracts";
import {
  authorizeAdapterExecution,
  type AdapterPrincipal,
  type PersistedPropertyMembership,
} from "./authorization";

const lifecycleSchema = z.enum([
  "draft", "pending_validation", "connected", "degraded", "suspended", "revoked", "error",
]);

export const persistedDistributionExternalAccountSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  provider_key: z.string().min(2).max(64),
  external_account_reference: z.string().trim().min(1).max(256),
  environment: distributionEnvironmentSchema,
  credential_reference: z.string().uuid(),
  lifecycle: z.enum(["pending_validation", "connected", "degraded", "suspended", "revoked", "error"]),
});

export const persistedDistributionAccountGrantSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  property_id: z.string().uuid(),
  external_account_id: z.string().uuid(),
  provider_key: z.string().min(2).max(64),
  environment: distributionEnvironmentSchema,
  grant_status: z.enum(["active", "revoked"]),
  granted_capabilities: z.array(distributionCapabilitySchema),
});

export const persistedDistributionConnectionSchema = z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  property_id: z.string().uuid(),
  account_grant_id: z.string().uuid(),
  external_account_id: z.string().uuid(),
  provider_key: z.string().min(2).max(64),
  adapter_version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
  environment: distributionEnvironmentSchema,
  lifecycle: lifecycleSchema,
});

export type PersistedDistributionExternalAccount = z.infer<typeof persistedDistributionExternalAccountSchema>;
export type PersistedDistributionAccountGrant = z.infer<typeof persistedDistributionAccountGrantSchema>;
export type PersistedDistributionConnection = z.infer<typeof persistedDistributionConnectionSchema>;

export type ResolvePersistedAdapterExecutionInput = Readonly<{
  principal: AdapterPrincipal;
  connection: unknown;
  accountGrant: unknown;
  externalAccount: unknown;
  propertyMembership?: PersistedPropertyMembership | null;
  manifest: AdapterManifest;
  capability: DistributionCapability;
  environment: DistributionEnvironment;
  operation: string;
  correlationId: string;
}>;

/**
 * Converts trusted, server-loaded rows into an execution context.
 * Call only after the server has authenticated the caller and loaded these rows
 * using a server-only database client. Browser/queue/webhook payloads are not rows.
 */
export function resolvePersistedAdapterExecution(
  input: ResolvePersistedAdapterExecutionInput,
): AdapterExecutionContext {
  const connection = persistedDistributionConnectionSchema.parse(input.connection);
  const grant = persistedDistributionAccountGrantSchema.parse(input.accountGrant);
  const account = persistedDistributionExternalAccountSchema.parse(input.externalAccount);
  const manifest = validateAdapterManifest(input.manifest);

  if (
    connection.account_grant_id !== grant.id ||
    connection.external_account_id !== grant.external_account_id ||
    connection.organisation_id !== grant.organisation_id ||
    connection.property_id !== grant.property_id ||
    connection.provider_key !== grant.provider_key ||
    connection.environment !== grant.environment
  ) {
    throw new Error("Persisted distribution connection and account grant scope do not match.");
  }

  if (
    account.id !== grant.external_account_id ||
    account.organisation_id !== grant.organisation_id ||
    account.provider_key !== grant.provider_key ||
    account.environment !== grant.environment
  ) {
    throw new Error("Persisted distribution account and grant scope do not match.");
  }

  if (account.lifecycle !== "connected" &&
      !(account.lifecycle === "pending_validation" && input.capability === "connection.health")) {
    throw new Error("Distribution external account is not available for this capability.");
  }

  if (grant.grant_status !== "active" || !grant.granted_capabilities.includes(input.capability)) {
    throw new Error("Distribution account grant does not permit this capability.");
  }

  return authorizeAdapterExecution({
    principal: input.principal,
    connection: {
      id: connection.id,
      organisationId: connection.organisation_id,
      propertyId: connection.property_id,
      externalAccountId: account.external_account_reference,
      providerKey: connection.provider_key,
      adapterVersion: connection.adapter_version,
      environment: connection.environment,
      lifecycle: connection.lifecycle,
      credentialReference: account.credential_reference,
    },
    propertyMembership: input.propertyMembership,
    accountGrant: {
      externalAccountId: account.external_account_reference,
      organisationId: grant.organisation_id,
      propertyId: grant.property_id,
      active: grant.grant_status === "active",
      canUseForDistribution: grant.granted_capabilities.includes(input.capability),
    },
    manifest,
    capability: input.capability,
    environment: input.environment,
    operation: input.operation,
    correlationId: input.correlationId,
  });
}
