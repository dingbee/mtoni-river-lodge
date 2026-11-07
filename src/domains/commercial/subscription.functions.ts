import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  commercialTrialPolicySchema,
  resolveCommercialTrialPolicy,
  type CommercialTrialPolicy,
} from "./trial-configuration-contract";

type CommercialQueryResult = { data: unknown; error: unknown | null };
type CommercialQuery = PromiseLike<CommercialQueryResult> & {
  select(columns?: string): CommercialQuery;
  eq(column: string, value: unknown): CommercialQuery;
  order(column: string, options?: { ascending?: boolean }): CommercialQuery;
  maybeSingle(): Promise<CommercialQueryResult>;
  insert(values: Record<string, unknown>): Promise<{ error: unknown | null }>;
};
type CommercialAdminClient = {
  from(table: string): CommercialQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<CommercialQueryResult>;
};
type CommercialAccountRow = { id: string; organisation_id: string; status: string; created_at?: string; updated_at?: string };
type CommercialSubscriptionRow = { id: string; account_id: string; plan_code: "essential" | "professional" | "enterprise"; plan_version: number; status: string };
type CommercialTrialActivationResult = {
  ok: true;
  replayed: boolean;
  accountId: string;
  subscriptionId: string;
  status: "trialing";
  policyVersion: number;
  trialStartedAt: string;
  trialEndsAt: string;
  eventId: string;
};

const activateTrialInput = z.object({
  subscriptionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

type VerifiedTenantActor = {
  userId: string;
  organisationId: string;
  propertyId: string;
  membershipRole: string;
  actorRole: "founder_admin" | "tenant_admin" | "tenant_staff";
};

export function actorRoleForMembership(role: string): VerifiedTenantActor["actorRole"] {
  return ["owner", "admin", "manager"].includes(role) ? "tenant_admin" : "tenant_staff";
}

export async function resolveVerifiedTenantActor(context: {
  supabase: unknown;
  userId: string;
}): Promise<VerifiedTenantActor> {
  const supabase = context.supabase as SupabaseClient<Database>;
  const commercialRpc = supabase.rpc.bind(supabase) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown | null }>;
  // Re-verify the JWT subject with Supabase Auth. The middleware's decoded
  // claims are not accepted as a substitute for the authoritative user lookup.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== context.userId) {
    throw new Error("Unauthenticated");
  }

  const { data: selectedContext, error: contextError } = await supabase
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (contextError || !selectedContext?.property_id) {
    throw new Error("Select an active property before managing the subscription.");
  }

  const [{ data: property, error: propertyError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase
        .from("staynas_properties")
        .select("id, organisation_id, status")
        .eq("id", selectedContext.property_id)
        .maybeSingle(),
      supabase
        .from("staynas_property_members")
        .select("role, status")
        .eq("property_id", selectedContext.property_id)
        .eq("user_id", authData.user.id)
        .maybeSingle(),
    ]);

  if (propertyError || membershipError || !property || property.status !== "active"
    || !membership || membership.status !== "active") {
    throw new Error("Active property membership could not be verified.");
  }

  const { data: organisation, error: organisationError } = await supabase
    .from("staynas_organisations")
    .select("id, status")
    .eq("id", property.organisation_id)
    .maybeSingle();
  if (organisationError || !organisation || organisation.status !== "active") {
    throw new Error("Active organisation could not be verified.");
  }

  const { data: hasAccess, error: accessError } = await commercialRpc(
    "commercial_user_has_organisation_access",
    { _organisation_id: organisation.id },
  );
  if (accessError || hasAccess !== true) {
    throw new Error("Forbidden: active tenant organisation access is required.");
  }

  const membershipRole = String(membership.role);
  return {
    userId: authData.user.id,
    organisationId: String(organisation.id),
    propertyId: String(property.id),
    membershipRole,
    actorRole: actorRoleForMembership(membershipRole),
  };
}

async function writeCommercialAudit(
  admin: CommercialAdminClient,
  actor: VerifiedTenantActor,
  input: {
    requestId: string;
    action: string;
    resourceType: "commercial_account" | "subscription";
    resourceRef: string;
    outcome: "succeeded" | "denied" | "failed";
    reasonCode?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await admin.from("commercial_audit_events").insert({
    request_id: input.requestId,
    actor_user_id: actor.userId,
    actor_organisation_id: actor.organisationId,
    actor_role: actor.actorRole,
    action: input.action,
    resource_type: input.resourceType,
    resource_ref: input.resourceRef,
    outcome: input.outcome,
    reason_code: input.reasonCode ?? null,
    metadata: {
      propertyId: actor.propertyId,
      membershipRole: actor.membershipRole,
      ...(input.metadata ?? {}),
    },
  });
  if (error) throw new Error("Commercial audit persistence failed.");
}

export async function loadTrialPolicies(admin: CommercialAdminClient): Promise<CommercialTrialPolicy[]> {
  const { data: currentData, error: currentError } = await admin
    .from("commercial_policy_config_current")
    .select("version_id")
    .eq("policy_type", "trial_policy")
    .maybeSingle();
  const current = currentData as { version_id: string } | null;
  if (currentError || !current?.version_id) {
    throw new Error("Founder-managed commercial trial policy is not published.");
  }

  const { data: policyData, error: policyError } = await admin
    .from("commercial_policy_config_versions")
    .select("payload")
    .eq("id", current.version_id)
    .maybeSingle();
  const payload = (policyData as { payload?: unknown } | null)?.payload;
  if (policyError || !Array.isArray(payload)) {
    throw new Error("Published founder-managed trial policy configuration is invalid.");
  }
  return payload.map((policy) => commercialTrialPolicySchema.parse(policy));
}

/** List only the commercial account and subscriptions for the verified active tenant. */
export const listMyCommercialSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as CommercialAdminClient;
    const { data: accountData, error: accountError } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status, created_at, updated_at")
      .eq("organisation_id", actor.organisationId)
      .maybeSingle();
    if (accountError) throw new Error("Unable to load the tenant commercial account.");
    const account = accountData as CommercialAccountRow | null;

    if (!account) return { account: null, subscriptions: [] };

    const { data: subscriptionsData, error: subscriptionsError } = await admin
      .from("commercial_subscriptions")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false });
    if (subscriptionsError) throw new Error("Unable to load tenant subscriptions.");
    const subscriptions = (subscriptionsData ?? []) as CommercialSubscriptionRow[];

    await writeCommercialAudit(admin, actor, {
      requestId: globalThis.crypto.randomUUID(),
      action: "subscription.listed",
      resourceType: "commercial_account",
      resourceRef: account.id,
      outcome: "succeeded",
    });

    return { account, subscriptions: subscriptions ?? [] };
  });

/**
 * Activate the tenant's own pending subscription as a one-time trial.
 * The published policy version is loaded from founder-managed durable configuration;
 * browser input cannot select a policy version or supply an actor identity.
 */
export const activateMyCommercialTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateTrialInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    const requestId = globalThis.crypto.randomUUID();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as CommercialAdminClient;

    if (actor.actorRole !== "tenant_admin") {
      await writeCommercialAudit(admin, actor, {
        requestId,
        action: "subscription.trial_activation_denied",
        resourceType: "subscription",
        resourceRef: data.subscriptionId,
        outcome: "denied",
        reasonCode: "tenant_admin_required",
      });
      throw new Error("Forbidden: tenant owner or manager authority is required.");
    }

    const { data: accountData, error: accountError } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status")
      .eq("organisation_id", actor.organisationId)
      .maybeSingle();
    const account = accountData as CommercialAccountRow | null;
    if (accountError || !account || account.status !== "active") {
      throw new Error("Active tenant commercial account was not found.");
    }

    const { data: subscriptionData, error: subscriptionError } = await admin
      .from("commercial_subscriptions")
      .select("id, account_id, plan_code, plan_version, status")
      .eq("id", data.subscriptionId)
      .eq("account_id", account.id)
      .maybeSingle();
    const subscription = subscriptionData as CommercialSubscriptionRow | null;
    if (subscriptionError || !subscription) {
      await writeCommercialAudit(admin, actor, {
        requestId,
        action: "subscription.trial_activation_denied",
        resourceType: "subscription",
        resourceRef: data.subscriptionId,
        outcome: "denied",
        reasonCode: "subscription_outside_tenant_scope",
      });
      throw new Error("Subscription not found in the active tenant account.");
    }

    const asOf = new Date().toISOString().slice(0, 10);
    let policy: CommercialTrialPolicy;
    try {
      policy = resolveCommercialTrialPolicy({
        planCode: subscription.plan_code,
        planVersion: subscription.plan_version,
        asOf,
      }, await loadTrialPolicies(admin));
    } catch {
      await writeCommercialAudit(admin, actor, {
        requestId,
        action: "subscription.trial_activation_failed",
        resourceType: "subscription",
        resourceRef: subscription.id,
        outcome: "failed",
        reasonCode: "trial_policy_resolution_failed",
      });
      throw new Error("No single enabled CC-02 trial policy matches this subscription.");
    }

    const { data: result, error: activationError } = await admin.rpc(
      "commercial_activate_trial",
      {
        _account_id: account.id,
        _subscription_id: subscription.id,
        _plan_code: policy.planCode,
        _plan_version: policy.planVersion,
        _policy_version: policy.policyVersion,
        _idempotency_key: data.idempotencyKey,
        _actor_user_id: actor.userId,
        _actor_organisation_id: actor.organisationId,
        _actor_role: actor.actorRole,
      },
    );

    if (activationError) {
      await writeCommercialAudit(admin, actor, {
        requestId,
        action: "subscription.trial_activation_failed",
        resourceType: "subscription",
        resourceRef: subscription.id,
        outcome: "failed",
        reasonCode: "trial_activation_transaction_failed",
      });
      throw new Error("Trial activation could not be completed.");
    }

    const activation = result as Partial<CommercialTrialActivationResult> | null;
    if (!activation || activation.ok !== true || activation.status !== "trialing"
      || typeof activation.accountId !== "string"
      || typeof activation.subscriptionId !== "string"
      || typeof activation.policyVersion !== "number"
      || typeof activation.trialStartedAt !== "string"
      || typeof activation.trialEndsAt !== "string"
      || typeof activation.eventId !== "string"
      || typeof activation.replayed !== "boolean") {
      await writeCommercialAudit(admin, actor, {
        requestId,
        action: "subscription.trial_activation_failed",
        resourceType: "subscription",
        resourceRef: subscription.id,
        outcome: "failed",
        reasonCode: "invalid_trial_activation_response",
      });
      throw new Error("Trial activation returned an invalid confirmation.");
    }

    // The activation RPC writes the success audit in the same transaction as
    // the state transition, permanent claim and lifecycle event.
    return {
      ok: true,
      replayed: activation.replayed,
      accountId: activation.accountId,
      subscriptionId: activation.subscriptionId,
      status: "trialing" as const,
      policyVersion: activation.policyVersion,
      trialStartedAt: activation.trialStartedAt,
      trialEndsAt: activation.trialEndsAt,
      eventId: activation.eventId,
    };
  });


/** Resolve founder authority from the dedicated caller-bound database predicate. */
export async function resolveVerifiedFounderActor(context: {
  supabase: unknown;
  userId: string;
}): Promise<VerifiedTenantActor> {
  const supabase = context.supabase as SupabaseClient<Database>;
  const commercialRpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown | null }>;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== context.userId) {
    throw new Error("Unauthenticated");
  }

  const { data: authorised, error: authorityError } = await commercialRpc(
    "commercial_is_founder_admin",
    { _principal_id: authData.user.id },
  );
  if (authorityError || authorised !== true) {
    throw new Error("Forbidden: verified commercial founder administrator authority is required.");
  }

  const { data: selectedContext, error: contextError } = await supabase
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (contextError || !selectedContext?.property_id) {
    throw new Error("Select an active founder-tenant property before commercial administration.");
  }

  const [{ data: property, error: propertyError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase.from("staynas_properties")
        .select("id, organisation_id, status")
        .eq("id", selectedContext.property_id).maybeSingle(),
      supabase.from("staynas_property_members")
        .select("role, status")
        .eq("property_id", selectedContext.property_id)
        .eq("user_id", authData.user.id).maybeSingle(),
    ]);
  if (propertyError || membershipError || !property || property.status !== "active"
    || !membership || membership.status !== "active") {
    throw new Error("Active founder-tenant property membership could not be verified.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as CommercialAdminClient;
  const { data: configData, error: configError } = await admin
    .from("commercial_founder_tenant_config")
    .select("founder_organisation_id")
    .eq("singleton", true)
    .maybeSingle();
  const config = configData as { founder_organisation_id: string } | null;
  if (configError || !config || config.founder_organisation_id !== property.organisation_id) {
    throw new Error("The selected property is not in the configured commercial founder tenant.");
  }

  return {
    userId: authData.user.id,
    organisationId: String(config.founder_organisation_id),
    propertyId: String(property.id),
    membershipRole: String(membership.role),
    actorRole: "founder_admin",
  };
}

/** Founder-only global commercial account view; tenant roles cannot call it. */
export const listCommercialAccountsForFounder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as CommercialAdminClient;
    const { data: accountsData, error } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load commercial accounts.");
    const accounts = (accountsData ?? []) as CommercialAccountRow[];

    await writeCommercialAudit(admin, actor, {
      requestId: globalThis.crypto.randomUUID(),
      action: "commercial_accounts.listed",
      resourceType: "commercial_account",
      resourceRef: "founder-account-index",
      outcome: "succeeded",
      metadata: { resultCount: (accounts ?? []).length },
    });
    return accounts ?? [];
  });
