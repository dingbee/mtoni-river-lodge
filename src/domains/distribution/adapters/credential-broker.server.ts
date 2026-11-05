import type { AdapterExecutionContext } from "./contracts";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DistributionCredentialRpcArgs = Readonly<{
  _connection_id: string;
  _organisation_id: string;
  _property_id: string;
  _provider_key: string;
  _external_account_reference: string;
  _environment: "sandbox" | "live";
  _capability: string;
  _correlation_id: string;
}>;

export type DistributionCredentialRpc = (
  args: DistributionCredentialRpcArgs,
) => Promise<{ data: unknown; error: unknown | null }>;

export type ResolvedDistributionCredential = Readonly<{
  connectionId: string;
  providerKey: string;
  environment: "sandbox" | "live";
  secret: string;
}>;

/**
 * Creates a server-side credential resolver. The RPC is intentionally injectable
 * for contract tests; production binds it to the server-only service-role client.
 * Never pass this return value to a route response, client function or logger.
 */
export function createDistributionCredentialResolver(rpc: DistributionCredentialRpc) {
  return async function resolveDistributionCredential(
    context: AdapterExecutionContext,
  ): Promise<ResolvedDistributionCredential> {
    if (
      !context.connectionId.trim() ||
      !context.organisationId.trim() ||
      !context.propertyId.trim() ||
      !context.providerKey.trim() ||
      !context.externalAccountReference.trim() ||
      !context.correlationId.trim() ||
      !context.operation.trim()
    ) {
      throw new Error("Distribution credential resolution context is incomplete.");
    }

    const { data, error } = await rpc({
      _connection_id: context.connectionId,
      _organisation_id: context.organisationId,
      _property_id: context.propertyId,
      _provider_key: context.providerKey,
      _external_account_reference: context.externalAccountReference,
      _environment: context.environment,
      _capability: context.capability,
      _correlation_id: context.correlationId,
    });

    if (error) {
      // Do not forward database/provider error text; it may contain sensitive details.
      throw new Error("Distribution credential resolution was denied or unavailable.");
    }
    if (typeof data !== "string" || data.length === 0 || data.length > 65_536) {
      throw new Error("Distribution credential resolution returned an invalid secret payload.");
    }

    return Object.freeze({
      connectionId: context.connectionId,
      providerKey: context.providerKey,
      environment: context.environment,
      secret: data,
    });
  };
}

export const resolveDistributionCredential = createDistributionCredentialResolver(
  async (args) => {
    const { data, error } = await (supabaseAdmin as any).rpc(
      "staynas_resolve_distribution_credential",
      args,
    );
    return { data, error };
  },
);
