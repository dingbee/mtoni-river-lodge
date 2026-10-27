import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantPaymentContext } from "./tenant-payment-integration.server";

export const MTONI_PROPERTY_ID = "258a4f01-28ac-4efb-a641-c7649e55dc95";

/** Resolve credentials only from an explicit, tenant-bound server-side reference. */
export async function resolvePaymentSecretReference(
  reference: string,
  propertyId: string,
): Promise<Record<string, string>> {
  if (reference === "env://mtoni-official-pesapal") {
    if (propertyId !== MTONI_PROPERTY_ID) {
      throw new Error("Mtoni's official Pesapal credentials cannot be used by another property");
    }
    const consumer_key = process.env.PESAPAL_CONSUMER_KEY;
    const consumer_secret = process.env.PESAPAL_CONSUMER_SECRET;
    if (!consumer_key || !consumer_secret) {
      throw new Error("Mtoni Pesapal credentials are not available in the server secret environment");
    }
    const ipn_id = process.env.PESAPAL_IPN_ID?.trim();
    return { consumer_key, consumer_secret, ...(ipn_id ? { ipn_id } : {}) };
  }

  if (reference.startsWith("vault://")) {
    const secretId = reference.slice("vault://".length);
    if (!/^[0-9a-f-]{36}$/i.test(secretId)) throw new Error("Invalid Vault credential reference");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc(
      "staynas_read_payment_vault_secret",
      { p_secret_id: secretId },
    );
    if (error || typeof data !== "string" || !data) {
      throw new Error("Vault credential could not be resolved");
    }
    let parsed: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(data);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid object");
      parsed = value as Record<string, unknown>;
    } catch {
      throw new Error("Vault credential payload is invalid");
    }
    const credentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key) || typeof value !== "string" || !value.trim()) {
        throw new Error("Vault credential payload contains an invalid credential");
      }
      credentials[key] = value;
    }
    if (Object.keys(credentials).length === 0) throw new Error("Vault credential payload is incomplete");
    return credentials;
  }

  throw new Error("Unknown credential reference; configure a supported server-side secret store");
}

export async function resolveBookingPaymentContext(
  supabaseAdmin: SupabaseClient,
  input: { propertyId: string; integrationId?: string; provider?: string; currency: string; callbackBaseUrl: string },
) {
  return resolveTenantPaymentContext(supabaseAdmin, {
    ...input,
    resolveSecretReference: (reference) => resolvePaymentSecretReference(reference, input.propertyId),
  });
}
