import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COMMERCIAL_MODULE_CODES } from "./catalogue-contract";
import { commercialPackageCompositionSchema } from "./package-composition-contract";
import { resolveEntitlement, type EntitlementResolution } from "./entitlement-engine";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor, resolveVerifiedTenantActor } from "./subscription.functions";

type Result = { data: unknown; error: unknown | null };
type Query = PromiseLike<Result> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  or(filters: string): Query;
  maybeSingle(): Promise<Result>;
};
type AdminClient = {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): Promise<Result>;
};
type SubscriptionRow = {
  id: string;
  account_id: string;
  plan_code: "essential" | "professional" | "enterprise";
  plan_version: number;
  status: "pending_activation" | "trialing" | "active" | "suspended" | "cancelled" | "expired";
  addon_codes: string[];
  property_count: number;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
};
type GrantRule = {
  id: string;
  grant_type: "addon_feature" | "custom_feature" | "override" | "platform_restriction";
  organisation_id: string | null;
  addon_code: string | null;
  feature_code: string;
  effect: "granted" | "suspended" | "review";
  effective_from: string;
  effective_to: string | null;
  reason: string;
};
const inputSchema = z.object({
  featureCode: z.enum(COMMERCIAL_MODULE_CODES),
});
const moduleCodeSchema = z.enum(COMMERCIAL_MODULE_CODES);

function effective(rule: GrantRule, now: number) {
  const start = Date.parse(rule.effective_from);
  const end = rule.effective_to ? Date.parse(rule.effective_to) : Number.POSITIVE_INFINITY;
  return Number.isFinite(start) && start <= now && end > now;
}
function sourceFor(featureCode: string, planFeatures: string[], addonRules: GrantRule[],
  customRules: GrantRule[], overrides: GrantRule[], purchasedAddonCodes: string[]) {
  const override = overrides.find((rule) => rule.effect === "granted" && rule.feature_code === featureCode);
  if (override) return { type: "override", ref: override.id };
  const custom = customRules.find((rule) => rule.feature_code === featureCode);
  if (custom) return { type: "custom", ref: custom.id };
  const addon = addonRules.find((rule) =>
    rule.feature_code === featureCode && rule.addon_code && purchasedAddonCodes.includes(rule.addon_code));
  if (addon) return { type: "addon", ref: addon.id };
  if (planFeatures.includes(featureCode)) return { type: "plan", ref: "published_composition" };
  return null;
}

/** Shared server-side enforcement entrypoint for authenticated StayNas operations. */
export async function assertCommercialEntitlement(
  context: { supabase: unknown; userId: string },
  featureCode: z.infer<typeof moduleCodeSchema>,
  options: { propertyCreationRequested?: boolean } = {},
): Promise<EntitlementResolution> {
  const actor = await resolveVerifiedTenantActor(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AdminClient;
  const { data: accountData, error: accountError } = await admin.from("commercial_accounts")
    .select("id, status").eq("organisation_id", actor.organisationId).maybeSingle();
  const account = accountData as { id: string; status: string } | null;
  if (accountError || !account || account.status !== "active") {
    throw new Error("Commercial account is unavailable; entitlement resolution failed closed.");
  }
  const { data: subscriptionData, error: subscriptionError } = await admin.from("commercial_subscriptions")
    .select("id, account_id, plan_code, plan_version, status, addon_codes, property_count, trial_ends_at, current_period_ends_at")
    .eq("account_id", account.id)
    .in("status", ["pending_activation", "trialing", "active", "suspended"])
    .maybeSingle();
  const subscription = subscriptionData as SubscriptionRow | null;
  if (subscriptionError || !subscription) {
    throw new Error("No current commercial subscription exists; entitlement resolution failed closed.");
  }
  const { data: pointerData, error: pointerError } = await admin.from("commercial_policy_config_current")
    .select("version_id").eq("policy_type", "composition").maybeSingle();
  const pointer = pointerData as { version_id: string } | null;
  const policyVersionId: string | null = pointer?.version_id ?? null;
  let planFeatures: string[] = [];
  let planFeaturePolicies: Array<{ featureCode: string; level?: "included" | "limited" | "advanced" | "enterprise" }> = [];
  let policyValid = false;
  if (!pointerError && pointer?.version_id) {
    const { data: versionData, error: versionError } = await admin.from("commercial_policy_config_versions")
      .select("payload").eq("id", pointer.version_id).eq("status", "published").maybeSingle();
    const payload = (versionData as { payload?: unknown } | null)?.payload;
    if (!versionError && payload && typeof payload === "object" && "compositions" in payload
      && Array.isArray((payload as { compositions?: unknown }).compositions)) {
      const compositions = (payload as { compositions: unknown[] }).compositions
        .map((item) => commercialPackageCompositionSchema.safeParse(item))
        .filter((item) => item.success)
        .map((item) => item.data);
      const today = new Date().toISOString().slice(0, 10);
      const matching = compositions.filter((item) =>
        item.status === "published" && item.planCode === subscription.plan_code
        && item.planVersion === subscription.plan_version
        && (!item.effectiveFrom || item.effectiveFrom <= today)
        && (!item.effectiveTo || item.effectiveTo >= today));
      if (matching.length === 1) {
        planFeatures = matching[0].moduleCodes;
        planFeaturePolicies = matching[0].moduleEntitlements?.filter((item) => item.level !== "unavailable")
          .map((item) => ({ featureCode: item.moduleCode, level: item.level }))
          ?? matching[0].moduleCodes.map((featureCode) => ({ featureCode, level: "included" as const }));
        policyValid = true;
      }
    }
  }
  const { data: rulesData, error: rulesError } = await admin.from("commercial_entitlement_grant_rules")
    .select("id, grant_type, organisation_id, addon_code, feature_code, effect, effective_from, effective_to, reason")
    .or(`organisation_id.eq.${actor.organisationId},organisation_id.is.null`);
  const now = Date.now();
  const activeRules = ((rulesData ?? []) as GrantRule[]).filter((rule) => effective(rule, now));
  const addonRules = activeRules.filter((rule) => rule.grant_type === "addon_feature");
  const customRules = activeRules.filter((rule) => rule.grant_type === "custom_feature"
    && rule.organisation_id === actor.organisationId && rule.effect === "granted");
  const overrides = activeRules.filter((rule) => rule.grant_type === "override"
    && rule.organisation_id === actor.organisationId)
    .sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from));
  const platformRules = activeRules.filter((rule) => rule.grant_type === "platform_restriction"
    && (!rule.organisation_id || rule.organisation_id === actor.organisationId)
    && rule.feature_code === featureCode);
  const platformRestriction = platformRules.some((rule) => rule.effect === "suspended") ? "suspended" as const
    : platformRules.some((rule) => rule.effect === "review") ? "review" as const : "none" as const;
  const { data: propertiesData, error: propertiesError } = await admin.from("staynas_properties")
    .select("id").eq("organisation_id", actor.organisationId).eq("status", "active");
  if (rulesError || propertiesError) {
    throw new Error("Entitlement policy or property scope could not be verified; access denied.");
  }
  const activePropertyCount = Array.isArray(propertiesData) ? propertiesData.length : 0;
  const featureAddonRules = addonRules.filter((rule) => rule.feature_code === featureCode);
  const featureCustomRules = customRules.filter((rule) => rule.feature_code === featureCode);
  const featureOverrides = overrides.filter((rule) => rule.feature_code === featureCode);
  const resolution = resolveEntitlement({
    tenantId: actor.organisationId,
    subscription: {
      id: subscription.id, status: subscription.status, planCode: subscription.plan_code,
      planVersion: subscription.plan_version, trialEndsAt: subscription.trial_ends_at,
      currentPeriodEndsAt: subscription.current_period_ends_at,
    },
    planFeatures: policyValid ? planFeaturePolicies : [],
    purchasedAddonCodes: subscription.addon_codes ?? [],
    addonFeatureGrants: featureAddonRules.map((rule) => ({
      addonCode: rule.addon_code as string, featureCodes: [rule.feature_code],
    })),
    customFeatureCodes: featureCustomRules.map((rule) => rule.feature_code),
    overrides: featureOverrides.map((rule) => ({
      featureCode: rule.feature_code,
      status: rule.effect === "suspended" ? "suspended" as const : "granted" as const,
      effectiveFrom: rule.effective_from, effectiveTo: rule.effective_to, reason: rule.reason,
    })),
    propertyCreationRequested: options.propertyCreationRequested,
    propertyAllowance: subscription.property_count, activePropertyCount,
    platformRestriction: policyValid ? platformRestriction : "review",
    now: new Date(now).toISOString(),
  }, featureCode);
  const source = resolution.allowed
    ? sourceFor(featureCode, planFeatures, featureAddonRules, featureCustomRules, featureOverrides, subscription.addon_codes)
    : null;
  const { error: recordError } = await admin.rpc("commercial_record_entitlement_decision", {
    _organisation_id: actor.organisationId, _subscription_id: subscription.id,
    _feature_code: featureCode, _allowed: resolution.allowed, _outcome: resolution.outcome,
    _source_type: source?.type ?? null, _source_ref: source?.ref ?? null,
    _reason: resolution.reason, _policy_version_id: policyVersionId,
    _context_snapshot: {
      planCode: subscription.plan_code, planVersion: subscription.plan_version,
      policyValid, activePropertyCount, propertyAllowance: subscription.property_count,
      entitlementLevel: resolution.entitlementLevel ?? null,
    },
  });
  if (recordError) throw new Error("Entitlement decision could not be durably recorded; access denied.");
  return resolution;
}

export const resolveMyCommercialEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => assertCommercialEntitlement(
    context as { supabase: unknown; userId: string }, data.featureCode,
  ));

const founderGrantInput = z.object({
  grantType: z.enum(["addon_feature", "custom_feature", "override", "platform_restriction"]),
  organisationId: z.string().uuid().nullable(),
  addonCode: z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/).nullable(),
  featureCode: z.enum(COMMERCIAL_MODULE_CODES),
  effect: z.enum(["granted", "suspended", "review"]),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
  reason: z.string().trim().min(3).max(500),
}).superRefine((value, ctx) => {
  if (value.effectiveTo && Date.parse(value.effectiveTo) <= Date.parse(value.effectiveFrom)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "Effective end must follow effective start." });
  }
  const valid =
    (value.grantType === "addon_feature" && value.addonCode !== null && value.organisationId === null && value.effect === "granted")
    || (value.grantType === "custom_feature" && value.addonCode === null && value.organisationId !== null && value.effect === "granted")
    || (value.grantType === "override" && value.addonCode === null && value.organisationId !== null && ["granted", "suspended"].includes(value.effect))
    || (value.grantType === "platform_restriction" && value.addonCode === null && ["suspended", "review"].includes(value.effect));
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Grant scope, target and effect are inconsistent." });
});

/** Founder-only policy authoring; database independently rechecks founder authority. */
export const recordFounderEntitlementGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => founderGrantInput.parse(input))
  .handler(async ({ data, context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const client = context.supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown | null }>;
    };
    const { data: id, error } = await client.rpc("commercial_record_entitlement_grant", {
      _grant_type: data.grantType,
      _organisation_id: data.organisationId,
      _addon_code: data.addonCode,
      _feature_code: data.featureCode,
      _effect: data.effect,
      _effective_from: data.effectiveFrom,
      _effective_to: data.effectiveTo,
      _reason: data.reason,
    });
    if (error || typeof id !== "string") throw new Error("Founder entitlement rule could not be persisted.");
    return { id };
  });
