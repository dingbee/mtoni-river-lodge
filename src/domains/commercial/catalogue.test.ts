import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_BILLING_TERMS,
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_MODULE_CODES,
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
    expect(commercialPlanSchema.safeParse({
      code: "starter",
      name: "Starter",
      description: "Unapproved tier",
      status: "draft",
    }).success).toBe(false);
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

  it("uses capability-level modules rather than navigation-level products", () => {
    expect(COMMERCIAL_MODULES.map((module) => module.code)).toEqual([...COMMERCIAL_MODULE_CODES]);
    expect(new Set(COMMERCIAL_MODULES.map((module) => module.code)).size).toBe(COMMERCIAL_MODULES.length);
    expect(COMMERCIAL_MODULES.every((module) => module.operationalModuleRefs.length === 0)).toBe(true);
  });

  it("validates plan-module relationships against known catalogue identities", () => {
    expect(commercialPlanModuleSchema.safeParse({
      planCode: "professional",
      planVersion: 1,
      moduleCode: "reservations",
      included: true,
    }).success).toBe(true);
    expect(commercialPlanModuleSchema.safeParse({
      planCode: "professional",
      planVersion: 1,
      moduleCode: "calendar_screen",
      included: true,
    }).success).toBe(false);
  });

  it("rejects invalid effective date ranges", () => {
    expect(commercialPlanVersionSchema.safeParse({
      planCode: "essential",
      version: 1,
      status: "draft",
      effectiveFrom: "2026-12-31",
      effectiveTo: "2026-01-01",
      changeReason: "Invalid date order",
    }).success).toBe(false);
  });

  it("prevents mutation or reactivation of published commercial versions", () => {
    expect(() => assertCommercialVersionTransition("published", "draft")).toThrow(/immutable/i);
    expect(() => assertCommercialVersionTransition("retired", "published")).toThrow(/cannot be reactivated/i);
    expect(() => assertCommercialVersionTransition("published", "retired")).not.toThrow();
  });

  it("resolves only canonical plan identities", () => {
    expect(getCommercialPlan("enterprise")?.name).toBe("Enterprise");
  });
});
