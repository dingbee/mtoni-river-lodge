import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_BILLING_TERMS,
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_MODULE_CODES,
  COMMERCIAL_FEATURE_CODES,
  COMMERCIAL_QUOTA_CODES,
  commercialAddonSchema,
  COMMERCIAL_PLAN_CODES,
  assertCommercialVersionTransition,
  commercialPlanModuleSchema,
  commercialPlanSchema,
  commercialPlanVersionSchema,
} from "./catalogue-contract";
import { COMMERCIAL_MODULES, COMMERCIAL_PLANS, getCommercialPlan } from "./catalogue";

describe("CC-02 commercial catalogue", () => {
  it("contains exactly the three SCEF v1.0 subscription tiers", () => {
    expect(COMMERCIAL_PLAN_CODES).toEqual(["essential", "professional", "enterprise"]);
    expect(COMMERCIAL_PLANS.map((plan) => plan.code)).toEqual([...COMMERCIAL_PLAN_CODES]);
    expect(
      commercialPlanSchema.safeParse({
        code: "starter",
        name: "Starter",
        description: "Unapproved tier",
        status: "draft",
      }).success,
    ).toBe(false);
  });

  it("does not invent plan prices, package composition, or billing defaults", () => {
    for (const plan of COMMERCIAL_PLANS) {
      expect(plan).not.toHaveProperty("price");
      expect(plan).not.toHaveProperty("billingTerm");
      expect(plan).not.toHaveProperty("modules");
    }
  });

  it("declares only approved billing terms and currencies", () => {
    expect(COMMERCIAL_BILLING_TERMS).toEqual(["monthly", "annual"]);
    expect(COMMERCIAL_CURRENCIES).toEqual(["TZS", "USD"]);
  });

  it("uses cap¶»§q«^