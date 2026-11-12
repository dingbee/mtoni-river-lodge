import type {
  AdapterExecutionContext,
  AdapterManifest,
  DistributionCapability,
  DistributionEnvironment,
} from "./contracts";

export type AdapterPrincipal = Readonly<{
  userId: string;
  active: boolean;
  platformAdmin: boolean;
}>;

/** These records must be loaded and verified by trusted server code before calling this policy. */
export type PersistedAdapterConnection = Readonly<{
  id: string;
  organisationId: string;
  propertyId: string;
  externalAccountId: string;
  providerKey: string;
  adapterVersion: string;
  environment: DistributionEnvironment;
  lifecycle:
    | "draft"
    | "pending_validation"
    | "connected"
    | "degraded"
    | "suspended"
    | "revoked"
    | "error";
  credentialReference: string | null;
}>;

export type PersistedPropertyMembership = Readonly<{
  userId: string;
  organisationId: string;
  propertyId: string;
  active: boolean;
  canManageDistribution: boolean;
}>;

export type PersistedExternalAccountGrant = Readonly<{
  externalAccountId: string;
  organisationId: string;
  propertyId: string;
  active: boolean;
  canUseForDistribution: boolean;
}>;

export type AdapterExecutionAuthorizationInput = Readonly<{
  principal: AdapterPrincipal;
  connection: PersistedAdapterConnection;
  propertyMembership?: PersistedPropertyMembership | null;
  accountGrant: PersistedExternalAccountGrant;
  manifest: AdapterManifest;
  capability: DistributionCapability;
  environment: DistributionEnvironment;
  operation: string;
  correlationId: string;
}>;

export class AdapterAuthorizationError extends Error {
  constructor(
    readonly code:
      | "inactive_principal"
      | "connection_not_usable"
      | "connection_scope_mismatch"
      | "property_access_denied"
      | "account_grant_denied"
      | "adapter_capability_denied"
      | "environment_mismatch"
      | "credential_reference_missing"
      | "invalid_execution_context",
  ) {
    super("Distribution adapter execution was denied by server-side policy.");
    this.name = "AdapterAuthorizationError";
  }
}

/**
 * Builds execution context exclusively from trusted persisted connection/grant records.
 * Do not pass browser, webhook or queue payload objects as these records.
 */
export function authorizeAdapterExecution(
  input: AdapterExecutionAuthorizationInput,
): AdapterExecutionContext {
  const { principal, connection, propertyMembership, accountGrant, manifest } = input;
  if (!principal.active || !principal.userId.trim()) {
    throw new AdapterAuthorizationError("inactive_principal");
  }
  if (
    connection.lifecycle !== "connected" &&
    !(connection.lifecycle === "pending_validation" && input.capability === "connection.health")
  ) {
    throw new AdapterAuthorizationError("connection_not_usable");
  }
  if (!connection.credentialReference?.trim()) {
    throw new AdapterAuthorizationError("credential_reference_missing");
  }
  if (
    connection.id.trim() === "" ||
    connection.organisationId.trim() === "" ||
    connection.propertyId.trim() === "" ||
    connection.externalAccountId.trim() === "" ||
    connection.providerKey !== manifest.providerKey ||
    connection.adapterVersion !== manifest.adapterVersion
  ) {
    throw new AdapterAuthorizationError("connection_scope_mismatch");
  }
  if (
    connection.environment !== input.environment ||
    !manifest.environments.includes(input.environment)
  ) {
    throw new AdapterAuthorizationError("environment_mismatch");
  }
  if (!manifest.capabilities.includes(input.capability)) {
    throw new AdapterAuthorizationError("adapter_capability_denied");
  }
  if (
    accountGrant.active !== true ||
    accountGrant.canUseForDistribution !== true ||
    accountGrant.externalAccountId !== connection.externalAccountId ||
    accountGrant.organisationId !== connection.organisationId ||
    accountGrant.propertyId !== connection.propertyId
  ) {
    throw new AdapterAuthorizationError("account_grant_denied");
  }
  if (!principal.platformAdmin) {
    if (
      !propertyMembership ||
      propertyMembership.active !== true ||
      propertyMembership.canManageDistribution !== true ||
      propertyMembership.userId !== principal.userId ||
      propertyMembership.organisationId !== connection.organisationId ||
      propertyMembership.propertyId !== connection.propertyId
    ) {
      throw new AdapterAuthorizationError("property_access_denied");
    }
  }
  if (!input.operation.trim() || !input.correlationId.trim()) {
    throw new AdapterAuthorizationError("invalid_execution_context");
  }

  return Object.freeze({
    organisationId: connection.organisationId,
    propertyId: connection.propertyId,
    connectionId: connection.id,
    providerKey: connection.providerKey,
    externalAccountReference: connection.externalAccountId,
    environment: connection.environment,
    operation: input.operation,
    capability: input.capability,
    correlationId: input.correlationId,
    adapterVersion: connection.adapterVersion,
  });
}
