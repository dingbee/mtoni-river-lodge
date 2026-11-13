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

export type PublishedAddonFeature = {
  code: string;
  status: string;
  featureCodes?: string[];
  limits?: Record<string, number>;
};

/** Derive grants only from published add-ons present in the accepted subscription. */
export function resolvePublishedAddonFeatureGrants(
  addons: PublishedAddonFeature[],
  purchasedAddonCodes: string[],
): Array<{ addonCode: string; featureCodes: string[] }> {
  const purchased = new Set(purchasedAddonCodes);
  return addons
    .filter((addon) => addon.status === "published" && purchased.has(addon.code))
    .map((addon) => ({
      addonCode: addon.code,
      featureCodes: [...new Set(addon.featureCodes ?? [])],
    }))
    .filter((grant) => grant.featureCodes.length > 0);
}

export function resolvePublishedAddonQuota(
  addons: PublishedAddonFeature[],
  purchasedAddonCodes: string[],
  quotaCode: string,
  usage: number,
): { allowed: bool¶»§q«^