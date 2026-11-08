import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor, resolveVerifiedTenantActor } from "./subscription.functions";

const guestProvider = z.enum(["pesapal","mpesa","airtel_money","mixx_by_yas","halopesa","bank_transfer","manual"]);
const currencies = z.array(z.enum(["TZS","USD"])).min(1).max(2);
const credentials = z.record(z.string().trim().min(1).max(80), z.string().min(1).max(3000)).min(1).max(16);

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Provider tables are introduced by the pending additive migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

async function storeProviderSecret(admin: Awaited<ReturnType<typeof getAdmin>>, payload: Record<string,string>, name: string) {
  const { data, error } = await admin.rpc("staynas_create_provider_secret", {
    _secret: JSON.stringify(payload), _name: name, _description: "StayNas administrator-managed payment provider credentials",
  });
  if (error || typeof data !== "string") throw new Error("Provider credentials could not be stored in Supabase Vault.");
  return data;
}

async function audit(admin: Awaited<ReturnType<typeof getAdmin>>, input: {
  actorUserId: string; organisationId: string; actorRole: "founder_admin" | "tenant_admin";
  action: string; resourceRef: string; metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("commercial_financial_audit_events").insert({
    request_id: globalThis.crypto.randomUUID(), actor_user_id: input.actorUserId,
    actor_organisation_id: input.organisationId, actor_role: input.actorRole,
    action: input.action, resource_type: "payment_provider_account",
    resource_ref: input.resourceRef, outcome: "succeeded", metadata: input.metadata ?? {},
  });
  if (error) throw new Error("Payment provider audit event could not be persisted.");
}

/** Property-scoped guest collection settings. The selected property is resolved server-side. */
export const listMyGuestPaymentProviderAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: property administrator authority is required.");
    const admin = await getAdmin();
    const { data, error } = await admin.from("staynas_guest_payment_provider_accounts")
      .select("id,property_id,provider,provider_account_ref,supported_currencies,integration_status,status,created_at,updated_at")
      .eq("organisation_id", actor.organisationId).eq("property_id", actor.propertyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Property payment provider settings could not be loaded.");
    return data ?? [];
  });

export const configureMyGuestPaymentProviderAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    provider: guestProvider,
    providerAccountRef: z.string().trim().min(2).max(200),
    supportedCurrencies: currencies,
    credentials,
  }).superRefine((value, ctx) => {
    if (["mpesa","airtel_money","mixx_by_yas","halopesa"].includes(value.provider)
      && (value.supportedCurrencies.length !== 1 || value.supportedCurrencies[0] !== "TZS")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supportedCurrencies"], message: "Tanzanian mobile-money providers must be configured in TZS." });
    }
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: property administrator authority is required.");
    const admin = await getAdmin();
    const { data: property, error: propertyError } = await admin.from("staynas_properties")
      .select("id,organisation_id,status").eq("id", actor.propertyId)
      .eq("organisation_id", actor.organisationId).maybeSingle();
    if (propertyError || !property || property.status !== "active") throw new Error("Active property scope could not be verified.");
    const secretRef = await storeProviderSecret(admin, data.credentials, `staynas-guest-${actor.propertyId}-${data.provider}`);
    const { data: account, error } = await admin.from("staynas_guest_payment_provider_accounts").insert({
      organisation_id: actor.organisationId, property_id: actor.propertyId,
      provider: data.provider, provider_account_ref: data.providerAccountRef,
      credential_secret_ref: secretRef, supported_currencies: [...new Set(data.supportedCurrencies)],
      integration_status: "adapter_pending", status: "inactive", created_by: actor.userId,
    }).select("id,property_id,provider,provider_account_ref,supported_currencies,integration_status,status").single();
    if (error || !account) throw new Error("Property payment provider configuration could not be saved.");
    await audit(admin, { actorUserId: actor.userId, organisationId: actor.organisationId,
      actorRole: "tenant_admin", action: "guest_payment_provider.configured", resourceRef: account.id,
      metadata: { provider: data.provider, integrationStatus: "adapter_pending" } });
    return account;
  });

/** Founder-only platform subscription collection providers. */
export const listFounderCommercialProviderAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data, error } = await admin.from("commercial_provider_accounts")
      .select("id,organisation_id,provider,provider_account_ref,supported_currencies,status,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Platform subscription payment provider settings could not be loaded.");
    const organisationIds = [...new Set((data ?? []).map((row: { organisation_id: string }) => row.organisation_id))];
    const { data: organisations } = organisationIds.length
      ? await admin.from("staynas_organisations").select("id,name,slug").in("id", organisationIds)
      : { data: [] };
    const names = new Map((organisations ?? []).map((row: {id:string;name:string;slug:string}) => [row.id, row.name || row.slug]));
    await audit(admin, { actorUserId: actor.userId, organisationId: actor.organisationId,
      actorRole: "founder_admin", action: "platform_payment_providers.viewed", resourceRef: "platform" });
    return (data ?? []).map((row: {organisation_id:string}) => ({ ...row, organisation_name: names.get(row.organisation_id) ?? "Organisation" }));
  });

export const configureFounderCommercialPesapalAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    organisationId: z.string().uuid(),
    providerAccountRef: z.string().trim().min(2).max(200),
    supportedCurrencies: currencies,
    consumerKey: z.string().trim().min(1).max(500),
    consumerSecret: z.string().trim().min(1).max(2000),
    environment: z.enum(["sandbox","live"]),
    ipnId: z.string().trim().min(1).max(200),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: account, error: accountError } = await admin.from("commercial_accounts")
      .select("id,organisation_id").eq("organisation_id", data.organisationId).maybeSingle();
    if (accountError || !account) throw new Error("Target StayNas commercial account was not found.");
    const secretRef = await storeProviderSecret(admin, {
      consumerKey: data.consumerKey, consumerSecret: data.consumerSecret,
      environment: data.environment, ipnId: data.ipnId,
    }, `staynas-platform-pesapal-${data.organisationId}`);
    const { data: provider, error } = await admin.from("commercial_provider_accounts").insert({
      organisation_id: data.organisationId, provider: "pesapal",
      provider_account_ref: data.providerAccountRef, credential_secret_ref: secretRef,
      supported_currencies: [...new Set(data.supportedCurrencies)], status: "inactive",
    }).select("id,organisation_id,provider,provider_account_ref,supported_currencies,status").single();
    if (error || !provider) throw new Error("Platform Pesapal configuration could not be saved.");
    await audit(admin, { actorUserId: actor.userId, organisationId: data.organisationId,
      actorRole: "founder_admin", action: "platform_pesapal.configured", resourceRef: provider.id,
      metadata: { environment: data.environment, status: "inactive" } });
    return provider;
  });

export const setFounderCommercialProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    providerAccountId: z.string().uuid(), status: z.enum(["inactive","active","suspended"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: provider, error } = await admin.from("commercial_provider_accounts")
      .select("id,organisation_id,provider,status,credential_secret_ref")
      .eq("id", data.providerAccountId).maybeSingle();
    if (error || !provider) throw new Error("Platform payment provider account was not found.");
    if (data.status === "active" && provider.provider !== "pesapal" && !["bank_transfer","manual"].includes(provider.provider)) {
      throw new Error("No approved platform payment adapter is available for this provider.");
    }
    const { error: updateError } = await admin.from("commercial_provider_accounts")
      .update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", provider.id);
    if (updateError) throw new Error("Platform payment provider status could not be updated.");
    await audit(admin, { actorUserId: actor.userId, organisationId: provider.organisation_id,
      actorRole: "founder_admin", action: "platform_payment_provider.status_changed",
      resourceRef: provider.id, metadata: { provider: provider.provider, status: data.status } });
    return { providerAccountId: provider.id, status: data.status };
  });

export const listFounderCommercialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data, error } = await admin.from("commercial_accounts").select("organisation_id").order("created_at", { ascending: false });
    if (error) throw new Error("StayNas commercial accounts could not be loaded.");
    const ids = [...new Set((data ?? []).map((row: { organisation_id: string }) => row.organisation_id))];
    const { data: organisations } = ids.length
      ? await admin.from("staynas_organisations").select("id,name,slug").in("id", ids)
      : { data: [] };
    return organisations ?? [];
  });
