import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  commercialTrialPolicySchema,
  resolveCommercialTrialPolicy,
  type CommercialTrialPolicy,
} from "./trial-configuration-contract";

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

function actorRoleForMembership(role: string): VerifiedTenantActor["actorRole"] {
  return ["owner", "admin", "manager"].includes(role) ? "tenant_admin" : "tenant_staff";
}

async function resolveVerifiedTenantActor(context: {
  supabase: any;
  userId: string;
}): Promise<VerifiedTenantActor> {
  // Re-verify the JWT subject with Supabase Auth. The middleware's decoded
  // claims are not accepted as a substitute for the authoritative user lookup.
  const { data: authData, error: authError } = await context.supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== context.userId) {
    throw new Error("Unauthenticated");
  }

  const { data: selectedContext, error: contextError } = await context.supabase
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (contextError || !selectedContext?.property_id) {
    throw new Error("Select an active property before managing the subscription.");
  }

  const [{ data: property, error: propertyError }, { data: membership, error: membershipError }] =
    await Promise.all([
      context.supabase
        .from("staynas_properties")
        .select("id, organisation_id, status")
        .eq("id", selectedContext.property_id)
        .maybeSingle(),
      context.supabase
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

  const { data: organisation, error: organisationError } = await context.supabase
    .from("staynas_organisations")
    .select("id, status")
    .eq("id", property.organisation_id)
    .maybeSingle();
  if (organisationError || !organisation || organisation.status !== "active") {
    throw new Error("Active organisation could not be verified.");
  }

  const { data: hasAccess, error: accessError } = await context.supabase.rpc(
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
  admin: any,
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

function loadTrialPolicies(): CommercialTrialPolicy[] {
  const raw = process.env.STAYNAS_COMMERCIAL_TRIAL_POLICIES_JSON;
  if (!raw) throw new Error("Commercial trial policy configuration is not provisioned.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Commercial trial policy configuration is invalid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("Commercial trial policy configuration must be an array.");
  return parsed.map((policy) => commercialTrialPolicySchema.parse(policy));
}

/** List only the commercial account and subscriptions for the verified active tenant. */
export const listMyCommercialSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: account, error: accountError } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status, created_at, updated_at")
      .eq("organisation_id", actor.organisationId)
      .maybeSingle();
    if (accountError) throw new Error("Unable to load the tenant commercial account.");

    if (!account) return { account: null, subscriptions: [] };

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("commercial_subscriptions")
      .select("*")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false });
    if (subscriptionsError) throw new Error("Unable to load tenant subscriptions.");

    await writeCommercialAudit(admin, actor, {
      requestId: randomUUID(),
      action: "subscription.listed",
      resourceType: "commercial_account",
      resourceRef: account.id,
      outcome: "succeeded",
    });

    return { account, subscriptions: subscriptions ?? [] };
  });

/**
 * Activate the tenant's own pending subscription as a one-time trial.
 * Policy JSON is server configuration owned by the CC-02 commercial authority;
 * browser input cannot select a policy version or supply an actor identity.
 */
export const activateMyCommercialTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateTrialInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    const requestId = randomUUID();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

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

    const { data: account, error: accountError } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status")
      .eq("organisation_id", actor.organisationId)
      .maybeSingle();
    if (accountError || !account || account.status !== "active") {
      throw new Error("Active tenant commercial account was not found.");
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("commercial_subscriptions")
      .select("id, account_id, plan_code, plan_version, status")
      .eq("id", data.subscriptionId)
      .eq("account_id", account.id)
      .maybeSingle();
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
      }, loadTrialPolicies());
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

    // The activation RPC writes the success audit in the same transaction as
    // the state transition, permanent claim and lifecycle event.
    return result;
  });


/** Resolve founder authority from the dedicated caller-bound database predicate. */
async function resolveVerifiedFounderActor(context: {
  supabase: any;
  userId: string;
}): Promise<VerifiedTenantActor> {
  const { data: authData, error: authError } = await context.supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== context.userId) {
    throw new Error("Unauthenticated");
  }

  const { data: authorised, error: authorityError } = await context.supabase.rpc(
    "commercial_is_founder_admin",
    { _principal_id: authData.user.id },
  );
  if (authorityError || authorised !== true) {
    throw new Error("Forbidden: verified commercial founder administrator authority is required.");
  }

  const { data: selectedContext, error: contextError } = await context.supabase
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (contextError || !selectedContext?.property_id) {
    throw new Error("Select an active founder-tenant property before commercial administration.");
  }

  const [{ data: property, error: propertyError }, { data: membership, error: membershipError }] =
    await Promise.all([
      context.supabase.from("staynas_properties")
        .select("id, organisation_id, status")
        .eq("id", selectedContext.property_id).maybeSingle(),
      context.supabase.from("staynas_property_members")
        .select("role, status")
        .eq("property_id", selectedContext.property_id)
        .eq("user_id", authData.user.id).maybeSingle(),
    ]);
  if (propertyError || membershipError || !property || property.status !== "active"
    || !membership || membership.status !== "active") {
    throw new Error("Active founder-tenant property membership could not be verified.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: config, error: configError } = await admin
    .from("commercial_founder_tenant_config")
    .select("founder_organisation_id")
    .eq("singleton", true)
    .maybeSingle();
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
    const admin = supabaseAdmin as any;
    const { data: accounts, error } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load commercial accounts.");

    await writeCommercialAudit(admin, actor, {
      requestId: randomUUID(),
      action: "commercial_accounts.listed",
      resourceType: "commercial_account",
      resourceRef: "founder-account-index",
      outcome: "succeeded",
      metadata: { resultCount: (accounts ?? []).length },
    });
    return accounts ?? [];
  });
