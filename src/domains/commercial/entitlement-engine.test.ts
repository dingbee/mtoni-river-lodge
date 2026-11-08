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

  it("denies a feature absent from plan and custom grants", () => {
    expect(resolveEntitlement(base, "finance").outcome).toBe("not_included_in_plan");
  });

  it("requires the configured add-on", () => {
    const input = {
      ...base,
      planFeatures: [{ featureCode: "distribution", requiredAddonCodes: ["distribution_pack"] }],
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

  it("does not silently enforce undocumented usage quotas", () => {
    expect(resolveEntitlement(base, "reservations").allowed).toBe(true);
  });
});
