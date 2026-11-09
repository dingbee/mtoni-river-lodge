import type { SupabaseClient } from "@supabase/supabase-js";

export type PropertyPesapalAccount = {
  id: string;
  organisation_id: string;
  property_id: string;
  provider_account_ref: string;
  environment: "sandbox" | "live";
  supported_currencies: string[];
  credential_secret_ref: string;
  public_configuration: Record<string, unknown>;
  integration_status: string;
  status: string;
};

export type PropertyPesapalCredentials = {
  consumer_key: string;
  consumer_secret: string;
};

function parseCredentials(value: unknown): PropertyPesapalCredentials {
  if (!value || typeof value !== "object") throw new Error("Property Pesapal credentials are invalid.");
  const row = value as Record<string, unknown>;
  if (typeof row.consumer_key !== "string" || typeof row.consumer_secret !== "string") {
    throw new Error("Property Pesapal credentials are incomplete.");
  }
  return { consumer_key: row.consumer_key, consumer_secret: row.consumer_secret };
}

export async function readPropertyPesapalCredentials(
  sb: SupabaseClient<any>,
  secretRef: string,
): Promise<PropertyPesapalCredentials> {
  const { data, error } = await (sb as any).rpc("staynas_read_provider_secret", { _secret_id: secretRef });
  if (error || typeof data !== "string") throw new Error("Property Pesapal credentials could not be loaded from Vault.");
  try {
    return parseCredentials(JSON.parse(data));
  } catch {
    throw new Error("Property Pesapal credentials in Vault are malformed.");
  }
}

export async function getActivePropertyPesapalAccount(
  sb: SupabaseClient<any>,
  organisationId: string,
  propertyId: string,
  currency: string,
) {
  const { data, error } = await (sb as any)
    .from("staynas_guest_payment_provider_accounts")
    .select("id,organisation_id,property_id,provider_account_ref,environment,supported_currencies,credential_secret_ref,public_configuration,integration_status,status")
    .eq("organisation_id", organisationId)
    .eq("property_id", propertyId)
    .eq("provider", "pesapal")
    .eq("status", "active")
    .eq("integration_status", "ready")
    .maybeSingle();
  if (error) throw new Error("Property guest-payment provider could not be resolved.");
  if (!data) throw new Error("Online booking is unavailable: this property has no active, certified Pesapal guest-payment account.");
  if (!data.credential_secret_ref) throw new Error("The property Pesapal account has no Vault credentials.");
  if (!(data.supported_currencies ?? []).includes(currency)) {
    throw new Error(`The property Pesapal account does not support ${currency} bookings.`);
  }
  return data as PropertyPesapalAccount;
}

export async function getPropertyPesapalAccountForSettlement(
  sb: SupabaseClient<any>,
  accountId: string,
  propertyId: string,
  currency: string,
) {
  const { data, error } = await (sb as any)
    .from("staynas_guest_payment_provider_accounts")
    .select("id,organisation_id,property_id,provider_account_ref,environment,supported_currencies,credential_secret_ref,public_configuration,integration_status,status")
    .eq("id", accountId)
    .eq("property_id", propertyId)
    .eq("provider", "pesapal")
    .maybeSingle();
  if (error) throw new Error("Booking's property Pesapal account could not be loaded.");
  if (!data || !data.credential_secret_ref) {
    throw new Error("The booking has no valid property-scoped Pesapal account. Platform credentials are not used as a fallback.");
  }
  if (!(data.supported_currencies ?? []).includes(currency)) {
    throw new Error("The booking currency is no longer supported by its original property Pesapal account.");
  }
  return data as PropertyPesapalAccount;
}
