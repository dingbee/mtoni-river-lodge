import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DistributionCapability, DistributionEnvironment } from "./contracts";
import type { DistributionAdapterRegistry } from "./registry";
import { resolvePersistedAdapterExecution } from "./persistence";

type AuthenticatedPrincipal = Readonly<{
  id: string;
  is_anonymous?: boolean;
  banned_until?: string | null;
}>;

export type DistributionExecutionRepository = Readonly<{
  getAuthenticatedPrincipal(accessToken: string): Promise<AuthenticatedPrincipal | null>;
  getConnection(connectionId: string): Promise<unknown | null>;
  getAccountGrant(grantId: string): Promise<unknown | null>;
  getExternalAccount(accountId: string): Promise<unknown | null>;
  getProperty(propertyId: string): Promise<{ organisation_id: string } | null>;
  getPropertyMembership(propertyId: string, userId: string): Promise<{
    property_id: string;
    user_id: string;
    role: string;
    status: string;
  } | null>;
}>;

export type TrustedDistributionExecutionInput = Readonly<{
  /** Access token extracted from the authenticated server request, never from an arbitrary body field. */
  accessToken: string;
  connectionId: string;
  capability: DistributionCapability;
  environment: DistributionEnvironment;
  operation: string;
  correlationId: string;
}>;

function assertRow<T>(row: T | null, label: string): T {
  if (!row) throw new Error(`Distribution ${label} was not found or is not accessible.`);
  return row;
}

export function createTrustedDistributionExecutionLoader(
  repository: DistributionExecutionRepository,
  registry: Pick<DistributionAdapterRegistry, "resolve">,
) {
  return async function loadTrustedDistributionExecutionContext(
    input: TrustedDistributionExecutionInput,
  ) {
    if (!input.accessToken.trim() || !input.connectionId.trim()) {
      throw new Error("Authenticated distribution execution context is incomplete.");
    }

    const principal = assertRow(
      await repository.getAuthenticatedPrincipal(input.accessToken),
      "principal",
    );
    const bannedUntil = principal.banned_until ? Date.parse(principal.banned_until) : 0;
    const active = !principal.is_anonymous && (!bannedUntil || bannedUntil <= Date.now());
    if (!active) throw new Error("Distribution execution is unavailable for this principal.");

    const connection = assertRow(
      await repository.getConnection(input.connectionId),
      "connection",
    ) as Record<string, any>;

    const [grant, account, property, membership] = await Promise.all([
      repository.getAccountGrant(String(connection.account_grant_id ?? "")),
      repository.getExternalAccount(String(connection.external_account_id ?? "")),
      repository.getProperty(String(connection.property_id ?? "")),
      repository.getPropertyMembership(String(connection.property_id ?? ""), principal.id),
    ]);

    const trustedProperty = assertRow(property, "property");
    const adapter = registry.resolve(
      String(connection.provider_key ?? ""),
      String(connection.adapter_version ?? ""),
    );

    const propertyMembership = membership && membership.status === "active"
      ? {
          userId: membership.user_id,
          organisationId: trustedProperty.organisation_id,
          propertyId: membership.property_id,
          active: true,
          canManageDistribution: ["owner", "manager", "admin"].includes(membership.role),
        }
      : null;

    return resolvePersistedAdapterExecution({
      principal: {
        userId: principal.id,
        active: true,
        // No platform-admin bypass until a dedicated, trusted StayNas platform
        // administrator source is wired here. Tenant roles never imply platform admin.
        platformAdmin: false,
      },
      connection,
      accountGrant: grant,
      externalAccount: account,
      propertyMembership,
      manifest: adapter.manifest,
      capability: input.capability,
      environment: input.environment,
      operation: input.operation,
      correlationId: input.correlationId,
    });
  };
}

const repository: DistributionExecutionRepository = {
  async getAuthenticatedPrincipal(accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return data.user;
  },
  async getConnection(connectionId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_distribution_connections")
      .select("*")
      .eq("id", connectionId)
      .maybeSingle();
    if (error) throw new Error("Distribution connection lookup failed.");
    return data;
  },
  async getAccountGrant(grantId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_distribution_account_grants")
      .select("*")
      .eq("id", grantId)
      .maybeSingle();
    if (error) throw new Error("Distribution account grant lookup failed.");
    return data;
  },
  async getExternalAccount(accountId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_distribution_external_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw new Error("Distribution external account lookup failed.");
    return data;
  },
  async getProperty(propertyId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_properties")
      .select("organisation_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (error) throw new Error("Distribution property lookup failed.");
    return data;
  },
  async getPropertyMembership(propertyId, userId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_property_members")
      .select("property_id,user_id,role,status")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error("Distribution property membership lookup failed.");
    return data;
  },
};

/** Bind the loader to the application's server-owned adapter registry. */
export function createSupabaseDistributionExecutionLoader(
  registry: Pick<DistributionAdapterRegistry, "resolve">,
) {
  return createTrustedDistributionExecutionLoader(repository, registry);
}
