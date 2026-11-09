import { describe, expect, it } from "vitest";
import { resolveEntitlement, type EntitlementResolutionInput } from "./entitlement-engine";

const base: EntitlementResolutionInput = {
  tenantId: "tenant-a",
  subscription: {
    id: "sub-a",
    status: "active",
    planCode: "professional",
    planVersion: 1,
    currentPeriodEndsAt: "2027-01-01T00:00:00.000Z",
  },
  planFeatures: [{ featureCode: "reservations" }],
  purchasedAddonCodes: [],
  now: "2026-11-08T12:00:00.000Z",
};

describe("CC-05 entitlement resolver", () => {
  it("grants a feature included in the published plan", () => {
    expect(resolveEntitlement(base, "reservations").outcome).toBe("granted");
  });

  it("denies a feature absent from plan, add-ons and custom grants", () => {
    expect(resolveEntitlement(base, "finance").outcome).toBe("not_included_in_plan");
  });

  it("grants an add-on feature only when its configured add-on is assigned", () => {
    const input = {
      ...base,
      addonFeatureGrants: [{ addonCode: "distribution_pack", featureCodes: ["distribution"] }],
    };
    expect(resolveEntitlement(input, "distribution").outcome).toBe("addon_required");
    expect(resolveEntitlement({ ...input, purchasedAddonCodes: ["distribution_pack"] }, "distribution").outcome)
      .toBe("granted");
  });

  it("fails closed for expired trials and suspended subscriptions", () => {
    expect(resolveEntitlement({
      ...base,
      subscription: { ...base.subscription, status: "trialing", trialEndsAt: "2026-11-07T00:00:00.000Z" },
    }, "reservations").outcome).toBe("trial_expired");
    expect(resolveEntitlement({
      ...base,
      subscription: { ...base.subscription, status: "suspended" },
    }, "reservations").outcome).toBe("temporarily_suspended");
  });

  it("enforces the property allowance only for a property-creation request", () => {
    const input = { ...base, propertyAllowance: 2, activePropertyCount: 2 };
    expect(resolveEntitlement(input, "reservations").outcome).toBe("granted");
    expect(resolveEntitlement({ ...input, propertyCreationRequested: true }, "reservations").outcome)
      .toBe("property_limit_reached");
  });

  it("does not silently enforce undocumented usage quotas", () => {
    expect(resolveEntitlement(base, "reservations").allowed).toBe(true);
  });

  it("fails closed when property creation count cannot be verified", () => {
    const input = { ...base, propertyAllowance: 2, activePropertyCount: undefined, propertyCreationRequested: true };
    expect(resolveEntitlement(input, "reservations").outcome).toBe("commercial_review_required");
  });

  it("honours the latest effective override", () => {
    const input = {
      ...base,
      overrides: [
        { featureCode: "finance", status: "granted" as const, effectiveFrom: "2026-11-08T11:00:00.000Z", reason: "new grant" },
        { featureCode: "finance", status: "suspended" as const, effectiveFrom: "2026-11-08T00:00:00.000Z", reason: "older suspension" },
      ],
    };
    expect(resolveEntitlement(input, "finance").outcome).toBe("granted");
  });

  it("honours only effective-dated overrides", () => {
    const input = {
      ...base,
      overrides: [{
        featureCode: "finance",
        status: "granted" as const,
        effectiveFrom: "2026-11-09T00:00:00.000Z",
        reason: "approved",
      }],
    };
    expect(resolveEntitlement(input, "finance").outcome).toBe("not_included_in_plan");
  });
});
