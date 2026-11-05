import { describe, expect, it } from "vitest";
import {
  type CommercialPackageComposition,
  commercialAddonCompatibilitySchema,
  commercialPackageCompositionSchema,
  validatePackageComposition,
} from "./package-composition-contract";

const composition: CommercialPackageComposition = {
  planCode: "professional" as const,
  planVersion: 1,
  status: "draft" as const,
  moduleCodes: ["reservations", "finance"],
  addonCodes: ["advanced_analytics"],
  effectiveFrom: null,
  effectiveTo: null,
};

describe("CC02.03 package composition and compatibility", () => {
  it("accepts a versioned composition without assuming a plan inclusion matrix", () => {
    expect(commercialPackageCompositionSchema.safeParse(composition).success).toBe(true);
  });

  it("rejects duplicate modules and add-ons", () => {
    expect(commercialPackageCompositionSchema.safeParse({
      ...composition,
      moduleCodes: ["finance", "finance"],
    }).success).toBe(false);
    expect(commercialPackageCompositionSchema.safeParse({
      ...composition,
      addonCodes: ["advanced_analytics", "advanced_analytics"],
    }).success).toBe(false);
  });

  it("rejects invalid effective date windows", () => {
    expect(commercialPackageCompositionSchema.safeParse({
      ...composition,
      effectiveFrom: "2026-12-01",
      effectiveTo: "2026-01-01",
    }).success).toBe(false);
  });

  it("accepts explicitly compatible add-ons and required modules", () => {
    const rule = commercialAddonCompatibilitySchema.parse({
      addonCode: "advanced_analytics",
      requiresModuleCodes: ["finance"],
      conflictsWithAddonCodes: [],
    });
    expect(validatePackageComposition(composition, [rule])).toEqual({ valid: true, issues: [] });
  });

  it("reports a missing required module", () => {
    const rule = commercialAddonCompatibilitySchema.parse({
      addonCode: "advanced_analytics",
      requiresModuleCodes: ["revenue"],
    });
    expect(validatePackageComposition(composition, [rule])).toEqual({
      valid: false,
      issues: [{ code: "required_module_missing", addonCode: "advanced_analytics", relatedCode: "revenue" }],
    });
  });

  it("reports explicitly conflicting add-ons", () => {
    const rule = commercialAddonCompatibilitySchema.parse({
      addonCode: "advanced_analytics",
      conflictsWithAddonCodes: ["custom_reporting"],
    });
    expect(validatePackageComposition({
      ...composition,
      addonCodes: ["advanced_analytics", "custom_reporting"],
    }, [rule])).toEqual({
      valid: false,
      issues: [{ code: "addon_conflict", addonCode: "advanced_analytics", relatedCode: "custom_reporting" }],
    });
  });

  it("rejects ambiguous compatibility rules instead of choosing one", () => {
    const rule = commercialAddonCompatibilitySchema.parse({ addonCode: "advanced_analytics" });
    expect(validatePackageComposition(composition, [rule, rule])).toEqual({
      valid: false,
      issues: [{ code: "ambiguous_compatibility_rule", addonCode: "advanced_analytics" }],
    });
  });

  it("does not infer a compatibility restriction when no rule is configured", () => {
    expect(validatePackageComposition(composition, [])).toEqual({ valid: true, issues: [] });
  });

  it("rejects self-conflicting add-on rules", () => {
    expect(commercialAddonCompatibilitySchema.safeParse({
      addonCode: "advanced_analytics",
      conflictsWithAddonCodes: ["advanced_analytics"],
    }).success).toBe(false);
  });
});
