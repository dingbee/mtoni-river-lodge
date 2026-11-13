import { describe, expect, it } from "vitest";
import { validateFounderPolicyPayload } from "./founder-policy.functions";

const planCodes = ["essential", "professional", "enterprise"] as const;
const currencies = ["TZS", "USD"] as const;
const terms = ["monthly", "annual"] as const;

function cataloguePayload() {
  return {
    plans: planCodes.map((code) => ({
      code,
      name: code[0]!.toUpperCase() + code.slice(1),
      description: `${code} plan`,
      status: "draft" as const,
    })),
    planVersions: planCodes.map((planCode) => ({
      planCode,
      version: 1,
      status: "draft" as const,
      effectiveFrom: null,
      effectiveTo: null,
      changeReason: "Initial policy test",
    })),
    modules: [],
    planModules: [],
    addons: [],
    quotaDefinitions: [],
  };
}

function pricingPayload() {
  return {
    planPrices: planCodes.flatMap((planCode) =>
      currencies.flatMap((currency) =>
        terms.map((billingTerm) => ({
          priceCode: `${planCode}_${currency.toLowerCase()}_${billingTerm}`,
          planCode,
          planVersion: 1,
          currency,
          billingTerm,
          priceMode: planCode === "enterprise" ? "quote_required" as const : "fixed" as const,
          baseAmountMinor: planCode === "enterprise" ? null : 10000,
          includedProperties: planCode === "enterprise" ? null : 1,
          additionalPropertyAmountMinor: planCode === "enterprise" ? null : 5000,
          status: "draft" as const,
          effectiveFrom: null,
          effectiveTo: null,
        })),
      ),
    ),
    addonPrices: [],
  };
}

function compositionPayload() {
  return {
    compositions: planCodes.map((planCode) => ({
      planCode,
      planVersion: 1,
      status: "draft" as const,
      moduleCodes: [],
      addonCodes: [],
      effectiveFrom: null,
      effectiveTo: null,
    })),
    compatibilityRules: [],
  };
}

function trialPolicyPayload() {
  return planCodes.map((planCode) => ({
    planCode,
    planVersion: 1,
    policyVersion: 1,
    enabled: true,
    durationDays: 14 as const,
    startTrigger: "subscription_activated" as const,
    effectiveFrom: null,
    effectiveTo: null,
  }));
}

describe("founder commercial policy payload validation", () => {
  it("allows schema-shaped drafts without publishing incomplete global policy", () => {
    expect(validateFounderPolicyPayload("catalogue", {
      plans: [], planVersions: [], modules: [], planModules: [], addons: [],
    }, "draft")).toEqual({
      plans: [], planVersions: [], modules: [], planModules: [], addons: [],
    });
    expect(validateFounderPolicyPayload("trial_policy", [], "draft")).toEqual([]);
  });

  it("requires all three SCEF plans and a version for each before catalogue publication", () => {
    expect(validateFounderPolicyPayload("catalogue", cataloguePayload(), "published")).toEqual(cataloguePayload());
    const incomplete = cataloguePayload();
    incomplete.plans.pop();
    expect(() => validateFounderPolicyPayload("catalogue", incomplete, "published"))
      .toThrow(/Essential, Professional and Enterprise/);
  });

  it("accepts optional implementation fees in plan pricing", () => {
    const payload = pricingPayload();
    payload.planPrices[0]!.implementationFeeMinor = 125000;
    expect(validateFounderPolicyPayload("pricing", payload, "draft").planPrices[0]!.implementationFeeMinor).toBe(125000);
  });

  it("requires unique pricing coverage for each plan, currency and billing term", () => {
    expect(validateFounderPolicyPayload("pricing", pricingPayload(), "published")).toEqual(pricingPayload());
    const incomplete = pricingPayload();
    incomplete.planPrices.pop();
    expect(() => validateFounderPolicyPayload("pricing", incomplete, "published"))
      .toThrow(/both currencies and billing terms/);
  });

  it("requires Enterprise quote pricing and fixed pricing for Essential and Professional", () => {
    const invalid = pricingPayload();
    invalid.planPrices[0]!.priceMode = "quote_required";
    invalid.planPrices[0]!.baseAmountMinor = null;
    invalid.planPrices[0]!.includedProperties = null;
    invalid.planPrices[0]!.additionalPropertyAmountMinor = null;
    expect(() => validateFounderPolicyPayload("pricing", invalid, "published"))
      .toThrow(/Quote-required pricing is reserved for Enterprise/);
  });

  it("requires all three package compositions without duplicate plan versions", () => {
    expect(validateFounderPolicyPayload("composition", compositionPayload(), "published")).toEqual(compositionPayload());
    const duplicate = compositionPayload();
    duplicate.compositions.push({ ...duplicate.compositions[0]! });
    expect(() => validateFounderPolicyPayload("composition", duplicate, "published"))
      .toThrow(/duplicate plan versions/);
  });

  it("requires enabled 14-day trial policies for all three plans before publication", () => {
    expect(validateFounderPolicyPayload("trial_policy", trialPolicyPayload(), "published")).toEqual(trialPolicyPayload());
    expect(() => validateFounderPolicyPayload("trial_policy", trialPolicyPayload().slice(0, 2), "published"))
      .toThrow(/14-day policies for all three plans/);
  });

  it("rejects a duplicate plan-version-policy tuple", () => {
    const policies = trialPolicyPayload();
    policies.push({ ...policies[0]! });
    expect(() => validateFounderPolicyPayload("trial_policy", policies, "published"))
      .toThrow(/unique, approved 14-day policies/);
  });
});
