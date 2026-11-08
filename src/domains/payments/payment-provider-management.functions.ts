import { createServerFn } from "@tanstack/react-start";
import { createCipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
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

type ProviderConfigRow = {
  id: string;
  configuration_scope: ProviderScope;
  organisation_id: string | null;
  property_id: string | null;
  provider: z.infer<typeof providerSchema>;
  provider_account_ref: string;
  environment: "sandbox" | "live";
  supported_currencies: string[];
  public_configuration: Record<string, unknown>;
  encrypted_credentials: string | null;
  credential_updated_at: string | null;
  status: ProviderStatus;
  created_at: string;
  updated_at: string;
};

function encryptCredentials(raw: string): string {
  const keyHex = process.env.STAYNAS_PROVIDER_CREDENTIALS_KEY;
  if (!keyHex || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error("Provider credential encryption is not provisioned. Configure the 32-byte server encryption key before saving credentials.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Credentials must be valid JSON containing the provider-specific credential fields.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed as Record<string, unknown>).length === 0) {
    throw new Error("Credentials must be a non-empty JSON object.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("hex")}.${tag.toString("hex")}.${encrypted.toString("hex")}`;
}

function validatePublicConfiguration(value: Record<string, unknown>) {
  const inspect = (input: unknown, path = "publicConfiguration") => {
    if (!input || typeof input !== "object") return;
    if (Array.isArray(input)) {
      input.forEach((entry, index) => inspect(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(input)) {
      if (/(secret|password|token|credential|api.?key|consumer.?key|client.?secret)/i.test(key)) {
        throw new Error(`Secret-like field "${path}.${key}" is not allowed in public configuration. Put it in the encrypted credentials field.`);
      }
      inspect(child, `${path}.${key}`);
    }
  };
  inspect(value);
  return value;
}

async function getAdmin(): Promise<CommercialAdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as CommercialAdminClient;
}

function safeProviderRow(row: ProviderConfigRow) {
  return {
    id: row.id,
    scope: row.configuration_scope,
    organisationId: row.organisation_id,
    propertyId: row.property_id,
    provider: row.provider,
    accountReference: row.provider_account_ref,
    environment: row.environment,
    supportedCurrencies: row.supported_currencies,
    publicConfiguration: row.public_configuration,
    hasCredentials: Boolean(row.encrypted_credentials),
    credentialUpdatedAt: row.credential_updated_at,
    status: row.status,
    adapterStatus: "adapter_required" as const,
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

const savePlatformInput = z.object({
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
    const { data, error } = await admin.from("staynas_payment_provider_configs")
      .select("*").eq("configuration_scope", "platform_subscription")
      .order("provider", { ascending: true });
    if (error) throw new Error("Platform subscription payment providers could not be loaded.");
    return ((data ?? []) as ProviderConfigRow[]).map(safeProviderRow);
  });

export const savePlatformPaymentProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => savePlatformInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const publicConfiguration = validatePublicConfiguration(data.publicConfiguration);
    const { data: existing, error: lookupError } = await admin.from("staynas_payment_provider_configs")
      .select("id,encrypted_credentials").eq("configuration_scope", "platform_subscription")
      .eq("provider", data.provider).eq("provider_account_ref", data.accountReference).maybeSingle();
    if (lookupError) throw new Error("Existing platform provider configuration could not be checked.");
    const credentials = data.credentialsJson ? encryptCredentials(data.credentialsJson) : null;
    if (!existing && !credentials && !["bank_transfer", "manual"].includes(data.provider)) {
      throw new Error("Credentials are required when first configuring this provider.");
    }
    const values = {
      configuration_scope: "platform_subscription",
      organisation_id: null,
      property_id: null,
      provider: data.provider,
      provider_account_ref: data.accountReference,
      environment: data.environment,
      supported_currencies: [...new Set(data.supportedCurrencies)],
      public_configuration: publicConfiguration,
      ...(credentials ? { encrypted_credentials: credentials, credential_updated_at: new Date().toISOString() } : {}),
      status: "inactive",
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
      ...(!existing ? { created_by: actor.userId } : {}),
    };
    const query = existing
      ? admin.from("staynas_payment_provider_configs").update(values).eq("id", existing.id).select("*").single()
      : admin.from("staynas_payment_provider_configs").insert(values).select("*").single();
    const { data: saved, error } = await query;
    if (error || !saved) throw new Error("Platform payment provider configuration could not be saved.");
    await auditProviderChange(admin, actor, "provider.platform_configured", saved.id, {
      provider: data.provider, environment: data.environment, status: "inactive",
      credentialsUpdated: Boolean(credentials),
    });
    return safeProviderRow(saved as ProviderConfigRow);
  });

const propertyListInput = z.object({
  organisationId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
});
export const listPropertyPaymentProviderConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => propertyListInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const organisationId = actor.organisationId;
    const propertyId = actor.propertyId;
    const admin = await getAdmin();
    const { data: rows, error } = await admin.from("staynas_payment_provider_configs")
      .select("*").eq("configuration_scope", "property_guest")
      .eq("organisation_id", organisationId).eq("property_id", propertyId)
      .order("provider", { ascending: true });
    if (error) throw new Error("Property guest-payment providers could not be loaded.");
    return ((rows ?? []) as ProviderConfigRow[]).map(safeProviderRow);
  });

const savePropertyInput = savePlatformInput.extend({
  organisationId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
});
export const savePropertyPaymentProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => savePropertyInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const admin = await getAdmin();
    const publicConfiguration = validatePublicConfiguration(data.publicConfiguration);
    const { data: existing, error: lookupError } = await admin.from("staynas_payment_provider_configs")
      .select("id,encrypted_credentials").eq("configuration_scope", "property_guest")
      .eq("organisation_id", actor.organisationId).eq("property_id", actor.propertyId)
      .eq("provider", data.provider).eq("provider_account_ref", data.accountReference).maybeSingle();
    if (lookupError) throw new Error("Existing property provider configuration could not be checked.");
    const credentials = data.credentialsJson ? encryptCredentials(data.credentialsJson) : null;
    if (!existing && !credentials && !["bank_transfer", "manual"].includes(data.provider)) {
      throw new Error("Credentials are required when first configuring this provider.");
    }
    const values = {
      configuration_scope: "property_guest",
      organisation_id: actor.organisationId,
      property_id: actor.propertyId,
      provider: data.provider,
      provider_account_ref: data.accountReference,
      environment: data.environment,
      supported_currencies: [...new Set(data.supportedCurrencies)],
      public_configuration: publicConfiguration,
      ...(credentials ? { encrypted_credentials: credentials, credential_updated_at: new Date().toISOString() } : {}),
      status: "inactive",
      updated_by: actor.userId,
      updated_at: new Date().toISOString(),
      ...(!existing ? { created_by: actor.userId } : {}),
    };
    const query = existing
      ? admin.from("staynas_payment_provider_configs").update(values).eq("id", existing.id).select("*").single()
      : admin.from("staynas_payment_provider_configs").insert(values).select("*").single();
    const { data: saved, error } = await query;
    if (error || !saved) throw new Error("Property guest-payment provider configuration could not be saved.");
    await auditProviderChange(admin, actor, "provider.property_configured", saved.id, {
      provider: data.provider, propertyId: actor.propertyId, environment: data.environment,
      status: "inactive", credentialsUpdated: Boolean(credentials),
    });
    return safeProviderRow(saved as ProviderConfigRow);
  });

export const setPropertyPaymentProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    providerConfigId: z.string().uuid(),
    status: z.enum(["inactive", "suspended"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Property administrator authority is required.");
    const admin = await getAdmin();
    const { data: updated, error } = await admin.from("staynas_payment_provider_configs")
      .update({ status: data.status, updated_by: actor.userId, updated_at: new Date().toISOString() })
      .eq("id", data.providerConfigId).eq("configuration_scope", "property_guest")
      .eq("organisation_id", actor.organisationId).eq("property_id", actor.propertyId)
      .select("id").maybeSingle();
    if (error || !updated) throw new Error("Property provider status could not be updated.");
    await auditProviderChange(admin, actor, "provider.property_status_changed", updated.id, { status: data.status });
    return { id: updated.id, status: data.status };
  });
