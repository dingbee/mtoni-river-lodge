import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { commercialPlatformProvider, type StayNasPaymentProvider } from "./provider-adapter.contract";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CommercialAdminClient } from "@/domains/commercial/commercial-payment.functions";
import {
  resolveVerifiedFounderActor,
  resolveVerifiedTenantActor,
} from "@/domains/commercial/subscription.functions";

const providerSchema = z.enum([
  "pesapal",
  "mpesa",
  "airtel_money",
  "mixx_by_yas",
  "halopesa",
  "bank_transfer",
  "manual",
]);
const currencySchema = z.enum(["TZS", "USD"]);
const publicConfigurationSchema = z.record(z.string(), z.unknown()).default({});

type ProviderScope = "platform_subscription" | "property_guest";
type ProviderStatus = "inactive" | "active" | "suspended";
type IntegrationStatus = "adapter_pending" | "ready" | "blocked";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type ProviderConfigRow = {
  id: string;
  provider: z.infer<typeof providerSchema>;
  provider_account_ref: string;
  credential_secret_ref: string | null;
  environment: "sandbox" | "live";
  supported_currencies: string[];
  public_configuration: JsonObject;
  integration_status: IntegrationStatus;
  status: ProviderStatus;
  credential_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

function validatePublicConfiguration(value: Record<string, unknown>): JsonObject {
  const inspect = (input: unknown, path = "publicConfiguration"): JsonValue => {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (Array.isArray(input)) return input.map((entry, index) => inspect(entry, `${path}[${index}]`));
    if (typeof input === "object") {
      const result: Record<string, JsonValue> = {};
      for (const [key, child] of Object.entries(input)) {
        if (/(secret|password|token|credential|api.?key|consumer.?key|client.?secret)/i.test(key)) {
          throw new Error(`Secret-like field "${path}.${key}" is not allowed in public configuration. Put it in the encrypted credentials field.`);
        }
        result[key] = inspect(child, `${path}.${key}`);
      }
      return result;
    }
    throw new Error(`Public configuration contains a non-JSON value at ${path}.`);
  };
  return inspect(value) as JsonObject;
}

function validateCredentialsJson(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Credentials must be valid JSON containing provider-specific fields.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed as Record<string, unknown>).length === 0) {
    throw new Error("Credentials must be a non-empty JSON object.");
  }
  return JSON.stringify(parsed);
}

async function getAdmin(): Promise<CommercialAdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as CommercialAdminClient;
}

/** Store provider credentials in Supabase Vault. Only the returned UUID is persisted in public rows. */
async function storeProviderCredentials(admin: CommercialAdminClient, raw: string, name: string) {
  const secret = validateCredentialsJson(raw);
  const { data, error } = await admin.rpc("staynas_create_provider_secret", {
    _secret: secret,
    _name: name,
    _description: "StayNas payment provider credentials",
  });
  if (error || typeof data !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data)) {
    throw new Error("Provider credentials could not be stored in the encrypted Vault.");
  }
  return data;
}

/** Server-only reader used by certified provider adapters. Never expose this result to browser code. */
export async function readProviderCredentials(admin: CommercialAdminClient, secretRef: string) {
  const { data, error } = await admin.rpc("staynas_read_provider_secret", { _secret_id: secretRef });
  if (error || typeof data !== "string") throw new Error("Provider credentials could not be loaded from Vault.");
  return JSON.parse(validateCredentialsJson(data)) as Record<string, unknown>;
}

function safeProviderRow(row: ProviderConfigRow, scope: ProviderScope) {
  return {
    id: row.id,
    scope,
    provider: row.provider,
    accountReference: row.provider_account_ref,
    environment: row.environment,
    supportedCurrencies: row.supported_currencies,
    publicConfiguration: row.public_configuration,
    hasCredentials: Boolean(row.credential_secret_ref),
    credentialUpdatedAt: row.credential_updated_at,
    integrationStatus: row.integration_status,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function auditProviderChange(
  admin: CommercialAdminClient,
  actor: { userId: string; organisationId: string; actorRole: "founder_admin" | "tenant_admin" | "tenant_staff" },
  action: string,
  providerId: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await admin.from("commercial_financial_audit_events").insert({
    request_id: globalThis.crypto.randomUUID(),
    actor_user_id: actor.userId,
    actor_organisation_id: actor.organisationId,
    actor_role: actor.actorRole === "tenant_staff" ? "tenant_admin" : actor.actorRole,
    action,
    resource_type: "payment_provider_configuration",
    resource_ref: providerId,
    outcome: "succeeded",
    metadata,
  });
  if (error) throw new Error("Payment provider audit event could not be persisted.");
}

const saveProviderInput = z.object({
  provider: providerSchema,
  accountReference: z.string().trim().min(2).max(200),
  environment: z.enum(["sandbox", "live"]),
  supportedCurrencies: z.array(currencySchema).min(1).max(2),
  publicConfiguration: publicConfigurationSchema,
  credentialsJson: z.string().trim().min(2).max(12000).optional(),
});

export const listPlatformPaymentProviderConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data, error } = await admin.from("staynas_platform_payment_provider_accounts")
      .select("*").order("provider", { ascending: true });
    if (error) throw new Error("Platform subscription payment providers could not be loaded.");
    return ((data ?? []) as ProviderConfigRow[]).map((row) => safeProviderRow(row, "platform_subscription"));
  });

export const savePlatformPaymentProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveProviderInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const publicConfiguration = validatePublicConfiguration(data.publicConfiguration);
    const { data: existing, error: lookupError } = await admin.from("staynas_platform_payment_provider_accounts")
      .select("id,credential_secret_ref").eq("provider", data.provider)
      .eq("provider_account_ref", data.accountReference).maybeSingle();
    if (lookupError) throw new Error("Existing platform provider configuration could not be checked.");
    const credentialSecretRef = data.credentialsJson
      ? await storeProviderCredentials(admin, data.credentialsJson, `staynas-platform-${data.provider}-${data.accountReference}`)
      : null;
    if (!existing && !credentialSecretRef && !["bank_transfer", "manual"].includes(data.provider)) {
      throw new Error("Credentials are required when first configuring this provider.");
    }
    const values = {
      provider: data.provider,
      provider_account_ref: data.accountReference,
      environment: data.environment,
      supported_currencies: [...new Set(data.supportedCurrencies)],
      public_configuration: publicConfiguration,
      ...(credentialSecretRef ? {
        credential_secret_ref: credentialSecretRef,
        credential_updated_at: new Date().toISOString(),
      } : {}),
      integration_status: "adapter_pending",
      status: "inactive",
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
      ...(!existing ? { created_by: actor.userId } : {}),
    };
    const query = existing
      ? admin.from("staynas_platform_payment_provider_accounts").update(values).eq("id", existing.id).select("*").single()
      : admin.from("staynas_platform_payment_provider_accounts").insert(values).select("*").single();
    const { data: saved, error } = await query;
    if (error || !saved) throw new Error("Platform payment provider configuration could not be saved.");
    await auditProviderChange(admin, actor, "provider.platform_configured", saved.id, {
      provider: data.provider, environment: data.environment, status: "inactive",
      credentialsUpdated: Boolean(credentialSecretRef),
    });
    // Bridge the founder-managed platform account into CC-04's tenant-scoped
    // payment-attempt FK. The same platform credential reference is reused;
    // tenants cannot read or change the underlying platform provider config.
    const commercialProvider = commercialPlatformProvider(data.provider);
    if (commercialProvider) {
      if (commercialProvider === "pesapal" && !saved.credential_secret_ref) {
        throw new Error("Pesapal credentials are required before creating CC-04 payment mappings.");
      }
      const { data: commercialAccounts, error: accountsError } = await admin.from("commercial_accounts")
        .select("organisation_id");
      if (accountsError) throw new Error("Commercial tenant accounts could not be synchronized to the platform provider.");
      const mappings = (commercialAccounts ?? []).map((account: { organisation_id: string }) => ({
        organisation_id: account.organisation_id,
        provider: commercialProvider,
        provider_account_ref: saved.provider_account_ref,
        credential_secret_ref: saved.credential_secret_ref ? String(saved.credential_secret_ref) : null,
        supported_currencies: saved.supported_currencies,
        status: "inactive",
      }));
      if (mappings.length) {
        const { error: mappingError } = await admin.from("commercial_provider_accounts")
          .upsert(mappings, { onConflict: "organisation_id,provider,provider_account_ref" });
        if (mappingError) throw new Error("CC-04 tenant payment provider mappings could not be synchronized.");
      }
    }
    return safeProviderRow(saved as ProviderConfigRow, "platform_subscription");
  });

export const listPropertyPaymentProviderConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const admin = await getAdmin();
    const { data, error } = await admin.from("staynas_guest_payment_provider_accounts")
      .select("*").eq("organisation_id", actor.organisationId)
      .eq("property_id", actor.propertyId).order("provider", { ascending: true });
    if (error) throw new Error("Property guest-payment providers could not be loaded.");
    return ((data ?? []) as ProviderConfigRow[]).map((row) => safeProviderRow(row, "property_guest"));
  });

export const savePropertyPaymentProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveProviderInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const admin = await getAdmin();
    const publicConfiguration = validatePublicConfiguration(data.publicConfiguration);
    const { data: existing, error: lookupError } = await admin.from("staynas_guest_payment_provider_accounts")
      .select("id,credential_secret_ref").eq("organisation_id", actor.organisationId)
      .eq("property_id", actor.propertyId).eq("provider", data.provider)
      .eq("provider_account_ref", data.accountReference).maybeSingle();
    if (lookupError) throw new Error("Existing property provider configuration could not be checked.");
    const credentialSecretRef = data.credentialsJson
      ? await storeProviderCredentials(admin, data.credentialsJson, `staynas-property-${actor.propertyId}-${data.provider}-${data.accountReference}`)
      : null;
    if (!existing && !credentialSecretRef && !["bank_transfer", "manual"].includes(data.provider)) {
      throw new Error("Credentials are required when first configuring this provider.");
    }
    const values = {
      organisation_id: actor.organisationId,
      property_id: actor.propertyId,
      provider: data.provider,
      provider_account_ref: data.accountReference,
      environment: data.environment,
      supported_currencies: [...new Set(data.supportedCurrencies)],
      public_configuration: publicConfiguration,
      ...(credentialSecretRef ? {
        credential_secret_ref: credentialSecretRef,
        credential_updated_at: new Date().toISOString(),
      } : {}),
      integration_status: "adapter_pending",
      status: "inactive",
      updated_at: new Date().toISOString(),
      ...(!existing ? { created_by: actor.userId } : {}),
    };
    const query = existing
      ? admin.from("staynas_guest_payment_provider_accounts").update(values).eq("id", existing.id).select("*").single()
      : admin.from("staynas_guest_payment_provider_accounts").insert(values).select("*").single();
    const { data: saved, error } = await query;
    if (error || !saved) throw new Error("Property guest-payment provider configuration could not be saved.");
    await auditProviderChange(admin, actor, "provider.property_configured", saved.id, {
      provider: data.provider, propertyId: actor.propertyId, environment: data.environment,
      status: "inactive", credentialsUpdated: Boolean(credentialSecretRef),
    });
    return safeProviderRow(saved as ProviderConfigRow, "property_guest");
  });

export const testPropertyPaymentProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ providerConfigId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const admin = await getAdmin();
    const { data: provider, error: lookupError } = await admin.from("staynas_guest_payment_provider_accounts")
      .select("id,provider,environment,credential_secret_ref,integration_status")
      .eq("id",data.providerConfigId).eq("organisation_id",actor.organisationId)
      .eq("property_id",actor.propertyId).maybeSingle();
    if (lookupError || !provider) throw new Error("Property provider configuration was not found.");
    if (provider.provider !== "pesapal") {
      throw new Error("No certified property guest-payment adapter is available for this provider yet.");
    }
    if (!provider.credential_secret_ref) throw new Error("Save the property's Pesapal credentials before testing the connection.");
    const credentials = await readProviderCredentials(admin, String(provider.credential_secret_ref));
    const { testPesapalPropertyAccount } = await import("@/lib/pesapal.server");
    await testPesapalPropertyAccount(
      credentials as { consumer_key: string; consumer_secret: string },
      provider.environment as "sandbox" | "live",
    );
    const { error: updateError } = await admin.from("staynas_guest_payment_provider_accounts")
      .update({ integration_status: "ready", updated_at: new Date().toISOString() })
      .eq("id",provider.id).eq("organisation_id",actor.organisationId).eq("property_id",actor.propertyId);
    if (updateError) throw new Error("Property Pesapal adapter readiness could not be recorded.");
    await auditProviderChange(admin, actor, "provider.property_connection_tested", provider.id, {
      provider: provider.provider, environment: provider.environment, result: "ready",
    });
    return { id: provider.id, integrationStatus: "ready" as const };
  });

export const setPlatformPaymentProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    providerConfigId: z.string().uuid(),
    status: z.enum(["inactive", "active", "suspended"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: provider, error: lookupError } = await admin.from("staynas_platform_payment_provider_accounts")
      .select("id,provider,provider_account_ref,credential_secret_ref,integration_status,status")
      .eq("id", data.providerConfigId).maybeSingle();
    if (lookupError || !provider) throw new Error("Platform provider configuration was not found.");
    if (data.status === "active" && provider.integration_status !== "ready") {
      throw new Error("Provider activation is blocked until its platform adapter passes certification.");
    }
    if (data.status === "active" && !["pesapal","bank_transfer","manual"].includes(provider.provider)) {
      throw new Error("No certified CC-04 platform collection adapter is available for this provider.");
    }
    const { error } = await admin.from("staynas_platform_payment_provider_accounts")
      .update({ status: data.status, updated_by: actor.userId, updated_at: new Date().toISOString() })
      .eq("id", provider.id);
    if (error) throw new Error("Platform provider status could not be updated.");
    const commercialProvider = commercialPlatformProvider(provider.provider as StayNasPaymentProvider);
    if (commercialProvider) {
      const { error: mappingError } = await admin.from("commercial_provider_accounts")
        .update({ status: data.status, updated_at: new Date().toISOString() })
        .eq("provider", commercialProvider).eq("provider_account_ref", provider.provider_account_ref);
      if (mappingError) throw new Error("CC-04 platform payment provider mappings could not be synchronized.");
    }
    await auditProviderChange(admin, actor, "provider.platform_status_changed", provider.id, { status: data.status });
    return { id: provider.id, status: data.status };
  });

export const setPropertyPaymentProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    providerConfigId: z.string().uuid(),
    status: z.enum(["inactive", "active", "suspended"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const admin = await getAdmin();
    const { data: provider, error: lookupError } = await admin.from("staynas_guest_payment_provider_accounts")
      .select("id,integration_status,status").eq("id", data.providerConfigId)
      .eq("organisation_id", actor.organisationId).eq("property_id", actor.propertyId).maybeSingle();
    if (lookupError || !provider) throw new Error("Property provider configuration was not found.");
    if (data.status === "active" && provider.integration_status !== "ready") {
      throw new Error("Provider activation is blocked until its property guest-payment adapter passes certification.");
    }
    const { error } = await admin.from("staynas_guest_payment_provider_accounts")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", provider.id).eq("organisation_id", actor.organisationId).eq("property_id", actor.propertyId);
    if (error) throw new Error("Property provider status could not be updated.");
    await auditProviderChange(admin, actor, "provider.property_status_changed", provider.id, { status: data.status });
    return { id: provider.id, status: data.status };
  });
