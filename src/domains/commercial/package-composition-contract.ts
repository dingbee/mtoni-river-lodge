import { z } from "zod";
import {
  COMMERCIAL_MODULE_CODES,
  COMMERCIAL_PLAN_CODES,
} from "./catalogue-contract";

/** CC02.03 versioned package composition with optional tiered module entitlements. */
const code = z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/);
const isoDate = z.string().date();

export const COMMERCIAL_COMPOSITION_STATUSES = ["draft", "published", "retired"] as const;

export const COMMERCIAL_ENTITLEMENT_LEVELS = ["included", "limited", "advanced", "enterprise", "unavailable"] as const;
export const commercialModuleEntitlementSchema = z.object({
  moduleCode: z.enum(COMMERCIAL_MODULE_CODES),
  level: z.enum(COMMERCIAL_ENTITLEMENT_LEVELS),
});
export type CommercialModuleEntitlement = z.infer<typeof commercialModuleEntitlementSchema>;

export const commercialPackageCompositionSchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  status: z.enum(COMMERCIAL_COMPOSITION_STATUSES),
  moduleCodes: z.array(z.enum(COMMERCIAL_MODULE_CODES)),
  /** Optional per-module commercial tier; legacy moduleCodes remain supported. */
  moduleEntitlements: z.array(commercialModuleEntitlementSchema).optional(),
  addonCodes: z.array(code).default([]),
  effectiveFrom: isoDate.nullable(),
  effectiveTo: isoDate.nullable(),
}).superRefine((value, ctx) => {
  if (value.moduleEntitlements && new Set(value.moduleEntitlements.map((item) => item.moduleCode)).size !== value.moduleEntitlements.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moduleEntitlements"], message: "A module may only have one entitlement level per plan" });
  }
  if (value.moduleEntitlements) {
    const enabled = value.moduleEntitlements.filter((item) => item.level !== "unavailable").map((item) => item.moduleCode).sort();
    if (enabled.join("|") !== [...value.moduleCodes].sort().join("|")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moduleCodes"], message: "moduleCodes must match all non-unavailable module entitlement entries" });
    }
  }
  if (new Set(value.moduleCodes).size !== value.moduleCodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["moduleCodes"], message: "A module may only appear once in a package composition" });
  }
  if (new Set(value.addonCodes).size !== value.addonCodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["addonCodes"], message: "An add-on may only appear once in a package composition" });
  }
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "Effective end date must not precede effective start date" });
  }
});
export type CommercialPackageComposition = z.infer<typeof commercialPackageCompositionSchema>;

/** Compatibility is data-driven; an absent rule means no constraint is asserted. */
export const commercialAddonCompatibilitySchema = z.object({
  addonCode: code,
  requiresModuleCodes: z.array(z.enum(COMMERCIAL_MODULE_CODES)).default([]),
  conflictsWithAddonCodes: z.array(code).default([]),
}).superRefine((value, ctx) => {
  if (new Set(value.requiresModuleCodes).size !== value.requiresModuleCodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["requiresModuleCodes"], message: "Required modules must be unique" });
  }
  if (new Set(value.conflictsWithAddonCodes).size !== value.conflictsWithAddonCodes.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conflictsWithAddonCodes"], message: "Conflicting add-ons must be unique" });
  }
  if (value.conflictsWithAddonCodes.includes(value.addonCode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["conflictsWithAddonCodes"], message: "An add-on cannot conflict with itself" });
  }
});
export type CommercialAddonCompatibility = z.infer<typeof commercialAddonCompatibilitySchema>;

export interface PackageCompositionIssue {
  code: "missing_compatibility_rule" | "ambiguous_compatibility_rule" | "required_module_missing" | "addon_conflict";
  addonCode: string;
  relatedCode?: string;
}

export interface PackageCompositionValidation {
  valid: boolean;
  issues: PackageCompositionIssue[];
}

/** Validates only explicitly supplied compatibility rules; never invents bundle contents. */
export function validatePackageComposition(
  rawComposition: CommercialPackageComposition,
  compatibilityRules: readonly CommercialAddonCompatibility[],
): PackageCompositionValidation {
  const composition = commercialPackageCompositionSchema.parse(rawComposition);
  const issues: PackageCompositionIssue[] = [];

  for (const addonCode of composition.addonCodes) {
    const rules = compatibilityRules.filter((rule) => rule.addonCode === addonCode);
    if (rules.length > 1) {
      issues.push({ code: "ambiguous_compatibility_rule", addonCode });
      continue;
    }
    if (rules.length === 0) continue;

    const rule = rules[0];
    if (!rule) continue;
    for (const requiredModule of rule.requiresModuleCodes) {
      if (!composition.moduleCodes.includes(requiredModule)) {
        issues.push({ code: "required_module_missing", addonCode, relatedCode: requiredModule });
      }
    }
    for (const conflictingAddon of rule.conflictsWithAddonCodes) {
      if (composition.addonCodes.includes(conflictingAddon)) {
        issues.push({ code: "addon_conflict", addonCode, relatedCode: conflictingAddon });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
