import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTenantPaymentContext } from "./tenant-payment-integration.server";

export const MTONI_PROPERTY_ID = "258a4f01-28ac-4efb-a641-c7649e55dc95";

/**
 * The legacy Pesapal environment variables are known to belong to Mtoni's
 * official merchant account. They are exposed only through this exact secret
 * reference and exact tenant ID; they are not a global provider fallback.
 * Other tenants must configure their own secret-manager reference.
 */
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
