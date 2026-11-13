/**
 * CC-05 entitlement resolution core.
 *
 * Consumes published CC-02 plan composition and trusted, server-resolved
 * subscription/add-on context. It does not invent plan matrices, add-on
 * compatibility, prices, or quotas. Resolve tenant identity and policy on
 * the server before calling this function.
 */
export type EntitlementOutcome =
  | "granted"
  | "not_included_in_plan"
  | "addon_required"
  | "subscription_inactive"
  | "subscription_expired"
  | "trial_expired"
  | "property_limit_reached"
  | "usage_limit_reached"
  | "temporarily_suspended"
  | "commercial_review_required";

export type SubscriptionStatus =
  | "pending_activation"
  | "trialing"
  | "active"
  | "suspended"
  | "expired"
  | "cancelled";

export interface EntitlementFeaturePolicy {
  featureCode: string;
  /** Commercial tier metadata from the exact published plan composition. */
  level?: "included" | "limited" | "advanced" | "enterprise";
}

export interface EntitlementAddonGrant {
  addonCode: string;
  featureCodes: string[];
}

export interface EntitlementOverride {
  featureCode: string;
  status: "granted" | "suspended";
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason: string;
}

export interface EntitlementResolutionInput {
  /** Trusted server-resolved tenant and subscription relationship. */
  tenantId: string;
  subscription: {
    id: string;
    status: SubscriptionStatus;
    planCode: "essential" | "professional" | "enterprise";
    planVersion: number;
    trialEndsAt?: string | null;
    currentPeriodEndsAt?: string | null;
  };
  /** Published CC-02 plan composition for this exact plan/version. */
  planFeatures: EntitlementFeaturePolicy[];
  /** Effective add-on assignments and their published feature grants. */
  purchasedAddonCodes: string[];
  addonFeatureGrants?: EntitlementAddonGrant[];
  /** Approved, effective Enterprise/custom grants. */
  customFeatureCodes?: string[];
  overrides?: EntitlementOverride[];
  /** Only apply property allowance when authorizing property creation. */
  propertyCreationRequested?: boolean;
  propertyAllowance?: number | null;
  activePropertyCount?: number;
  /** Only explicitly configured quotas may be supplied/enforced. */
  usage?: {
    metric: string;
    used: number;
    limit: number;
    period: string;
  };
  /** Platform-level deny/suspend control, resolved by trusted server context. */
  platformRestriction?: "none" | "suspended" | "review";
  now?: string;
}

export interface EntitlementResolution {
  outcome: EntitlementOutcome;
  allowed: boolean;
  tenantId: string;
  subscriptionId: string;
  featureCode: string;
  reason: string;
  /** Effective plan tier; defaults to included for explicit add-on/custom/override grants. */
  entitlementLevel?: "included" | "limited" | "advanced" | "enterprise";
  requiredAddonCodes?: string[];
  usage?: EntitlementResolutionInput["usage"];
}

function isEffective(start: string, end: string | null | undefined, now: number): boolean {
  const from = Date.parse(start);
  const to = end ? Date.parse(end) : Number.POSITIVE_INFINITY;
  return Number.isFinite(from) && from <= now && to > now;
}

export function resolveEntitlement(
  input: EntitlementResolutionInput,
  featureCode: string,
): EntitlementResolution {
  const now = Date.parse(input.now ?? new Date().toISOString());
  const base = {
    tenantId: input.tenantId,
    subscriptionId: input.subscription.id,
    featureCode,
  };
  const deny = (
    outcome: EntitlementOutcome,
    reason: string,
    extra: Partial<EntitlementResolution> = {},
  ): EntitlementResolution => ({ ...base, outcome, allowed: false, reason, ...extra });

  if (!input.tenantId || !input.subscription.id || !featureCode || !Number.isFinite(now)) {
    return deny("commercial_review_required", "Trusted entitlement context is incomplete.");
  }
  if (input.platformRestriction === "suspended") {
    return deny("temporarily_suspended", "Platform access is temporarily suspended.");
  }
  if (input.platformRestriction === "review") {
    return deny("commercial_review_required", "Platform access requires commercial review.");
  }

  const { subscription } = input;
  if (subscription.status === "suspended") {
    return deny("temporarily_suspended", "Subscription is suspended.");
  }
  if (subscription.status === "expired" || subscription.status === "cancelled") {
    return deny("subscription_expired", "Subscription is no longer active.");
  }
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    return deny("subscription_inactive", "Subscription has not been activated.");
  }
  if (subscription.status === "trialing") {
    const trialEnd = subscription.trialEndsAt ? Date.parse(subscription.trialEndsAt) : NaN;
    if (!Number.isFinite(trialEnd) || trialEnd <= now) {
      return deny("trial_expired", "The trial period has ended or has no valid end date.");
    }
  } else {
    const periodEnd = subscription.currentPeriodEndsAt ? Date.parse(subscription.currentPeriodEndsAt) : NaN;
    if (!Number.isFinite(periodEnd) || periodEnd <= now) {
      return deny("subscription_expired", "The paid subscription period has ended or is not configured.");
    }
  }

  const activeOverrides = (input.overrides ?? []).filter(
    (item) => item.featureCode === featureCode && isEffective(item.effectiveFrom, item.effectiveTo, now),
  );
  const activeOverride = activeOverrides.sort(
    (a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom),
  )[0];
  if (activeOverride?.status === "suspended") {
    return deny("temporarily_suspended", "An authorized commercial override suspends this capability.");
  }

  const planFeature = input.planFeatures.find((item) => item.featureCode === featureCode);
  const planIncludes = Boolean(planFeature);
  const customIncludes = (input.customFeatureCodes ?? []).includes(featureCode);
  const overrideGrants = activeOverride?.status === "granted";
  const eligibleAddonCodes = (input.addonFeatureGrants ?? [])
    .filter((grant) => grant.featureCodes.includes(featureCode))
    .map((grant) => grant.addonCode);
  const addonIncludes = eligibleAddonCodes.some((code) => input.purchasedAddonCodes.includes(code));

  if (!planIncludes && !customIncludes && !overrideGrants && !addonIncludes) {
    return deny(
      eligibleAddonCodes.length ? "addon_required" : "not_included_in_plan",
      eligibleAddonCodes.length ? "An eligible add-on is required." : "Capability is not included in the published plan.",
      eligibleAddonCodes.length ? { requiredAddonCodes: eligibleAddonCodes } : {},
    );
  }

  if (input.propertyCreationRequested && input.propertyAllowance !== undefined
    && input.propertyAllowance !== null) {
    if (!Number.isInteger(input.activePropertyCount) || (input.activePropertyCount as number) < 0) {
      return deny("commercial_review_required", "Active property count could not be verified.");
    }
    if ((input.activePropertyCount as number) >= input.propertyAllowance) {
      return deny("property_limit_reached", "The approved property allowance has been reached.");
    }
  }
  if (input.usage && input.usage.used >= input.usage.limit) {
    return deny("usage_limit_reached", "The configured usage limit has been reached.", { usage: input.usage });
  }

  return {
    ...base,
    outcome: "granted",
    allowed: true,
    entitlementLevel: planFeature?.level ?? "included",
    reason: "Capability is authorized by effective commercial policy.",
  };
}
