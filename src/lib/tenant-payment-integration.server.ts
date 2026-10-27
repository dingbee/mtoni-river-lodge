import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentEnvironment, TenantPaymentContext } from "./payment-provider.contract";

/**
 * Resolves an enabled payment integration strictly within the booking tenant.
 * Credentials are intentionally not stored in public_config. credential_reference
 * points to a server-side secret manager; secret resolution is injected so the
 * database never becomes a plaintext credential store.
 */
export async function resolveTenantPaymentContext(
  supabaseAdmin: SupabaseClient,
  input: {
    propertyId: string;
    integrationId?: string;
    provider?: string;
    currency: string;
    callbackBaseUrl: string;
    resolveSecretReference: (reference: string) => Promise<Record<string, string>>;
  },
): Promise<TenantPaymentContext> {
  if (!input.propertyId) throw new Error("Property context is required for payment");
  if (!input.integrationId && !input.provider) throw new Error("Integration ID or provider is required");

  let query = (supabaseAdmin as any)
    .from("staynas_property_integrations")
    .select("id, property_id, provider, purpose, enabled, environment, credential_reference, public_config")
    .eq("property_id", input.propertyId)
    .eq("purpose", "payments")
    .eq("enabled", true);
  query = input.integrationId ? query.eq("id", input.integrationId) : query.eq("provider", input.provider);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Could not resolve tenant payment integration: ${error.message}`);
  if (!data) throw new Error("No enabled payment integration matches this property");
  if (data.property_id !== input.propertyId) throw new Error("Payment integration belongs to a different property");
  if (!data.credential_reference) throw new Error("Payment integration has no secure credential reference");

  const environment = data.environment as PaymentEnvironment;
  if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid payment environment");
  const credentials = await input.resolveSecretReference(data.credential_reference);
  if (!credentials || Object.keys(credentials).length === 0) {
    throw new Error("Payment provider credentials could not be resolved");
  }

  return {
    propertyId: input.propertyId,
    integrationId: data.id,
    provider: String(data.provider).toLowerCase(),
    environment,
    currency: input.currency.toUpperCase(),
    callbackBaseUrl: input.callbackBaseUrl.replace(/\/$/, ""),
    credentials: Object.freeze({ ...credentials }),
    publicConfig: Object.freeze({ ...(data.public_config ?? {}) }),
  };
}
