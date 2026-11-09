import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdapterExecutionContext } from "./adapters/contracts";
import { authorizeAdapterExecution } from "./adapters/authorization";
import { createChannexAdapter } from "./adapters/channex.adapter";

const sandboxConfigSchema = z.object({
  apiBaseUrl: z.string().url().max(500),
  allowedHosts: z.array(z.string().min(1).max(253)).min(1).max(10),
}).superRefine((config, ctx) => {
  try {
    const url = new URL(config.apiBaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      ctx.addIssue({ code: "custom", path: ["apiBaseUrl"], message: "Use an HTTPS endpoint without credentials, query or fragment." });
    }
    if (!config.allowedHosts.map((host) => host.toLowerCase()).includes(url.hostname.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["allowedHosts"], message: "The endpoint hostname must be explicitly allowlisted." });
    }
  } catch {
    ctx.addIssue({ code: "custom", path: ["apiBaseUrl"], message: "A valid HTTPS endpoint is required." });
  }
});

function correlationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function getAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function assertPlatformAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("staynas_platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: platform administrator access is required.");
  return getAdminClient();
}

async function getManagedProperty(context: any, admin: any) {
  const { data: selected, error: selectedError } = await admin
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (selectedError || !selected?.property_id) {
    throw new Error("Select an active property before configuring distribution.");
  }

  const [{ data: property, error: propertyError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.from("staynas_properties").select("id,organisation_id,status,name").eq("id", selected.property_id).maybeSingle(),
    admin.from("staynas_property_members").select("property_id,user_id,role,status")
      .eq("property_id", selected.property_id).eq("user_id", context.userId).eq("status", "active").maybeSingle(),
  ]);
  if (propertyError || !property || property.status !== "active") {
    throw new Error("The selected property is not active.");
  }
  if (membershipError || !membership || !["owner", "manager", "admin"].includes(membership.role)) {
    throw new Error("Active property owner or manager access is required.");
  }
  const { data: organisation, error: organisationError } = await admin
    .from("staynas_organisations").select("status").eq("id", property.organisation_id).maybeSingle();
  if (organisationError || organisation?.status !== "active") {
    throw new Error("The property organisation is not active.");
  }
  return { property, membership };
}

export const listDistributionProviderCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let admin: any;
    let isPlatformAdmin = false;
    try {
      admin = await assertPlatformAdmin(context);
      isPlatformAdmin = true;
    } catch {
      admin = await getAdminClient();
      await getManagedProperty(context, admin);
    }
    const query = admin.from("staynas_distribution_provider_catalogue")
      .select("provider_key,display_name,description,adapter_key,adapter_version,lifecycle,capabilities,environment_config")
      .order("display_name");
    const { data, error } = await (isPlatformAdmin ? query : query.eq("lifecycle", "active"));
    if (error) throw new Error("Unable to load the distribution provider catalogue.");
    return { isPlatformAdmin, providers: data ?? [] };
  });

export const saveDistributionProviderConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    providerKey: z.literal("channex"),
    lifecycle: z.enum(["active", "suspended"]),
    sandbox: sandboxConfigSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertPlatformAdmin(context);
    const { data: existing, error: readError } = await admin
      .from("staynas_distribution_provider_catalogue")
      .select("provider_key")
      .eq("provider_key", data.providerKey)
      .maybeSingle();
    if (readError || !existing) throw new Error("Provider catalogue entry was not found.");

    const environmentConfig = { sandbox: data.sandbox };
    const { error: updateError } = await admin
      .from("staynas_distribution_provider_catalogue")
      .update({
        lifecycle: data.lifecycle,
        environment_config: environmentConfig,
        capabilities: ["connection.health"],
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_key", data.providerKey);
    if (updateError) throw new Error("Provider configuration could not be saved.");

    const { error: auditError } = await admin.from("staynas_distribution_provider_catalogue_audit").insert({
      provider_key: data.providerKey,
      event_type: "provider.environment_config_changed",
      actor_user_id: context.userId,
      actor_type: "platform_admin",
      change_summary: "Updated sandbox endpoint and exact host allowlist; enabled only connection.health.",
      correlation_id: correlationId("dc07a-provider-config"),
    });
    if (auditError) throw new Error("Provider configuration saved but audit recording failed.");
    return { ok: true };
  });

export const listPropertyDistributionConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdminClient();
    const { property } = await getManagedProperty(context, admin);
    const { data, error } = await admin.from("staynas_distribution_connections")
      .select("id,provider_key,adapter_version,environment,lifecycle,created_at,staynas_distribution_external_accounts(external_account_reference)")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load property distribution connections.");
    return (data ?? []).map((row: any) => ({
      id: row.id,
      providerKey: row.provider_key,
      adapterVersion: row.adapter_version,
      environment: row.environment,
      lifecycle: row.lifecycle,
      createdAt: row.created_at,
      externalAccountReference: row.staynas_distribution_external_accounts?.external_account_reference ?? "",
    }));
  });

export const createPropertyDistributionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    providerKey: z.literal("channex"),
    externalAccountReference: z.string().trim().min(1).max(256),
    apiKey: z.string().trim().min(1).max(65536),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdminClient();
    const { property } = await getManagedProperty(context, admin);
    const { data: provider, error: providerError } = await admin
      .from("staynas_distribution_provider_catalogue")
      .select("provider_key,lifecycle,adapter_version,capabilities,environment_config")
      .eq("provider_key", data.providerKey)
      .maybeSingle();
    if (providerError || !provider || provider.lifecycle !== "active" ||
        !provider.capabilities?.includes("connection.health") ||
        !provider.environment_config?.sandbox) {
      throw new Error("Channex sandbox is not enabled in the platform provider catalogue.");
    }
    const { data: connectionId, error } = await admin.rpc("staynas_create_distribution_connection", {
      _organisation_id: property.organisation_id,
      _property_id: property.id,
      _provider_key: data.providerKey,
      _environment: "sandbox",
      _external_account_reference: data.externalAccountReference,
      _credential_secret: data.apiKey,
      _adapter_version: provider.adapter_version,
      _granted_capabilities: ["connection.health"],
      _actor_user_id: context.userId,
      _correlation_id: correlationId("dc07a-connection-create"),
    });
    if (error || typeof connectionId !== "string") {
      throw new Error("The Channex sandbox connection could not be created. Check the account reference and platform configuration.");
    }
    return { connectionId };
  });

export const validatePropertyDistributionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdminClient();
    const { property, membership } = await getManagedProperty(context, admin);
    const { data: connection, error: connectionError } = await admin
      .from("staynas_distribution_connections").select("*")
      .eq("id", data.connectionId).eq("property_id", property.id).maybeSingle();
    if (connectionError || !connection) throw new Error("Distribution connection was not found for the selected property.");

    const [{ data: grant, error: grantError }, { data: account, error: accountError }, { data: provider, error: providerError }] = await Promise.all([
      admin.from("staynas_distribution_account_grants").select("*").eq("id", connection.account_grant_id).maybeSingle(),
      admin.from("staynas_distribution_external_accounts").select("*").eq("id", connection.external_account_id).maybeSingle(),
      admin.from("staynas_distribution_provider_catalogue").select("*").eq("provider_key", connection.provider_key).maybeSingle(),
    ]);
    if (grantError || !grant || accountError || !account || providerError || !provider) {
      throw new Error("Distribution connection records are incomplete.");
    }
    if (connection.provider_key !== "channex" || connection.environment !== "sandbox" ||
        connection.adapter_version !== "1.0.0" || provider.lifecycle !== "active") {
      throw new Error("This DC-07A validation path supports only the configured Channex sandbox adapter.");
    }

    const adapter = createChannexAdapter({
      environments: { sandbox: provider.environment_config.sandbox },
      resolveApiKey: async (executionContext, handle) => {
        const { resolveDistributionCredential } = await import("./adapters/credential-broker.server");
        const resolved = await resolveDistributionCredential(executionContext);
        if (resolved.connectionId !== handle.connectionId || resolved.environment !== handle.environment) {
          throw new Error("Credential scope mismatch.");
        }
        return resolved.secret;
      },
    });

    const executionContext: AdapterExecutionContext = authorizeAdapterExecution({
      principal: { userId: context.userId, active: true, platformAdmin: false },
      connection: {
        id: connection.id,
        organisationId: connection.organisation_id,
        propertyId: connection.property_id,
        externalAccountId: account.external_account_reference,
        providerKey: connection.provider_key,
        adapterVersion: connection.adapter_version,
        environment: connection.environment,
        lifecycle: connection.lifecycle,
        credentialReference: account.credential_reference,
      },
      propertyMembership: {
        userId: membership.user_id,
        organisationId: property.organisation_id,
        propertyId: membership.property_id,
        active: membership.status === "active",
        canManageDistribution: ["owner", "manager", "admin"].includes(membership.role),
      },
      accountGrant: {
        externalAccountId: account.external_account_reference,
        organisationId: grant.organisation_id,
        propertyId: grant.property_id,
        active: grant.grant_status === "active",
        canUseForDistribution: grant.granted_capabilities.includes("connection.health"),
      },
      manifest: adapter.manifest,
      capability: "connection.health",
      environment: "sandbox",
      operation: "connection.health",
      correlationId: correlationId("dc07a-channex-health"),
    });

    const result = await adapter.healthCheck!(executionContext, {
      reference: account.credential_reference,
      connectionId: connection.id,
      environment: "sandbox",
    });
    if (!result.ok) {
      return { ok: false, code: result.error.code, message: result.error.safeMessage };
    }

    const now = new Date().toISOString();
    const [{ error: accountUpdateError }, { error: connectionUpdateError }, { error: auditError }] = await Promise.all([
      admin.from("staynas_distribution_external_accounts").update({ lifecycle: "connected", updated_by: context.userId, updated_at: now }).eq("id", account.id),
      admin.from("staynas_distribution_connections").update({ lifecycle: "connected", updated_by: context.userId, updated_at: now }).eq("id", connection.id),
      admin.from("staynas_distribution_audit_events").insert({
        organisation_id: property.organisation_id,
        property_id: property.id,
        account_grant_id: grant.id,
        connection_id: connection.id,
        event_type: "connection.lifecycle_changed",
        from_state: connection.lifecycle,
        to_state: "connected",
        actor_type: "user",
        actor_user_id: context.userId,
        reason: "Channex sandbox connection health check passed.",
        correlation_id: executionContext.correlationId,
      }),
    ]);
    if (accountUpdateError || connectionUpdateError || auditError) {
      throw new Error("Provider health check passed, but the connection state could not be durably finalized.");
    }
    return { ok: true, state: "connected", checkedAt: now, latencyMs: result.value.latencyMs };
  });
