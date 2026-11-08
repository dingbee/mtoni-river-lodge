/**
 * CC-05 entitlement resolution core.
 *
 * This module consumes the published CC-02 policy and trusted CC-03 subscription
 * context. It deliberately contains no plan matrix, price, quota, or frontend
 * identity assumptions. Callers must resolve tenant/subscription identity on
 * the server before invoking it.
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
  requiredAddonCodes?: string[];
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
  /** Add-ons actually assigned to this subscription and currently effective. */
  purchasedAddonCodes: string[];
  /** Approved, effective Enterprise/custom grants. */
  customFeatureCodes?: string[];
  overrides?: EntitlementOverride[];
  /** Authoritative commercial property allowance; null means not defined. */
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
  } else if (subscription.currentPeriodEndsAt) {
    const periodEnd = Date.parse(subscription.currentPeriodEndsAt);
    if (!Number.isFinite(periodEnd) || periodEnd <= now) {
      return deny("subscription_expired", "The paid subscription period has ended.");
    }
  }

  const overrides = (input.overrides ?? []).filter(
    (item) => item.featureCode === featureCode && isEffective(item.effectiveFrom, item.effectiveTo, now),
  );
  const activeOverride = overrides.at(-1);
  if (activeOverride?.status === "suspended") {
    return deny("temporarily_suspended", "An authorized commercial override suspends this capability.");
  }

  const planIncludes = input.planFeatures.some((item) => item.featureCode === featureCode);
  const customIncludes = (input.customFeatureCodes ?? []).includes(featureCode);
  const overrideGrants = activeOverride?.status === "granted";
  const addonCodes = input.planFeatures.find((item) => item.featureCode === featureCode)?.requiredAddonCodes ?? [];
  const addonIncludes = addonCodes.some((code) => input.purchasedAddonCodes.includes(code));

  if (!planIncludes && !customIncludes && !overrideGrants) {
    return deny(
      addonCodes.length ? "addon_required" : "not_included_in_plan",
      addonCodes.length ? "An eligible add-on is required." : "Capability is not included in the published plan.",
      addonCodes.length ? { requiredAddonCodes: addonCodes } : {},
    );
  }
  if (planIncludes && addonCodes.length && !addonIncludes && !customIncludes && !overrideGrants) {
    return deny("addon_required", "An eligible add-on is required.", { requiredAddonCodes: addonCodes });
  }

  if (input.propertyAllowance !== undefined && input.propertyAllowance !== null
    && (input.activePropertyCount ?? 0) > input.propertyAllowance) {
    return deny("commercial_review_required", "Existing property count exceeds the approved allowance; review is required.");
  }
  if (input.usage && input.usage.used >= input.usage.limit) {
    return deny("usage_limit_reached", "The configured usage limit has been reached.", { usage: input.usage });
  }

  return { ...base, outcome: "granted", allowed: true, reason: "Capability is authorized by effective commercial policy." };
}
