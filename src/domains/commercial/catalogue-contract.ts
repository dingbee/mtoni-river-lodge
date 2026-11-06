import { z } from "zod";

/**
 * CC-02 commercial catalogue contracts.
 *
 * This domain describes purchasable platform products. It is deliberately
 * separate from property room/rate pricing, subscriptions, invoices, payments,
 * and runtime entitlements.
 */

export const COMMERCIAL_PLAN_CODES = ["essential", "professional", "enterprise"] as const;
export type CommercialPlanCode = (typeof COMMERCIAL_PLAN_CODES)[number];

export const COMMERCIAL_PLAN_STATUSES = ["draft", "published", "retired"] as const;
export type CommercialPlanStatus = (typeof COMMERCIAL_PLAN_STATUSES)[number];

export const COMMERCIAL_VERSION_STATUSES = ["draft", "published", "retired"] as const;
export type CommercialVersionStatus = (typeof COMMERCIAL_VERSION_STATUSES)[number];

export const COMMERCIAL_CURRENCIES = ["TZS", "USD"] as const;
export type CommercialCurrency = (typeof COMMERCIAL_CURRENCIES)[number];

export const COMMERCIAL_BILLING_TERMS = ["monthly", "annual"] as const;
export type CommercialBillingTerm = (typeof COMMERCIAL_BILLING_TERMS)[number];

/**
 * Capability groups are intentionally coarser than navigation entries.
 * operationalModuleRefs connect a commercial capability to existing app
 * registry identifiers without making every screen independently sellable.
 */
export const COMMERCIAL_MODULE_CODES = [
  "reservations",
  "rooms",
  "front_desk",
  "operations",
  "housekeeping",
  "guests",
  "finance",
  "revenue",
  "automation",
  "concierge",
  "content",
  "marketing",
  "integrations",
  "intelligence",
] as const;
export type CommercialModuleCode = (typeof COMMERCIAL_MODULE_CODES)[number];

export const COMMERCIAL_CATALOGUE_STATUSES = ["draft", "active", "retired"] as const;
export type CommercialCatalogueStatus = (typeof COMMERCIAL_CATALOGUE_STATUSES)[number];

const nonEmptyCode = z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/);
const nonEmptyName = z.string().trim().min(2).max(120);
const description = z.string().trim().max(2000);

export const commercialPlanSchema = z.object({
  code: z.enum(COMMERCIAL_PLAN_CODES),
  name: nonEmptyName,
  description,
  status: z.enum(COMMERCIAL_PLAN_STATUSES),
});
export type CommercialPlan = z.infer<typeof commercialPlanSchema>;

export const commercialPlanVersionSchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  version: z.number().int().positive(),
  status: z.enum(COMMERCIAL_VERSION_STATUSES),
  effectiveFrom: z.string().date().nullable(),
  effectiveTo: z.string().date().nullable(),
  changeReason: z.string().trim().min(3).max(500).nullable(),
}).superRefine((value, ctx) => {
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Effective end date must not precede effective start date",
    });
  }
});
export type CommercialPlanVersion = z.infer<typeof commercialPlanVersionSchema>;

export const commercialModuleSchema = z.object({
  code: z.enum(COMMERCIAL_MODULE_CODES),
  name: nonEmptyName,
  description,
  status: z.enum(COMMERCIAL_CATALOGUE_STATUSES),
  operationalModuleRefs: z.array(nonEmptyCode).default([]),
});
export type CommercialModule = z.infer<typeof commercialModuleSchema>;

export const commercialPlanModuleSchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  moduleCode: z.enum(COMMERCIAL_MODULE_CODES),
  included: z.literal(true),
});
export type CommercialPlanModule = z.infer<typeof commercialPlanModuleSchema>;

export const commercialAddonSchema = z.object({
  code: nonEmptyCode,
  name: nonEmptyName,
  description,
  status: z.enum(COMMERCIAL_CATALOGUE_STATUSES),
});
export type CommercialAddon = z.infer<typeof commercialAddonSchema>;

export const catalogueReadSchema = z.object({
  includeRetired: z.boolean().default(false),
});
export type CatalogueReadInput = z.infer<typeof catalogueReadSchema>;

export const planDetailsSchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  version: z.number().int().positive().optional(),
});
export type PlanDetailsInput = z.infer<typeof planDetailsSchema>;

/** Published catalogue records are immutable; changes require a new version. */
export function assertCommercialVersionTransition(
  current: CommercialVersionStatus,
  next: CommercialVersionStatus,
): void {
  if (current === "published" && next !== "retired") {
    throw new Error("Published commercial versions are immutable; create a new version");
  }
  if (current === "retired" && next !== "retired") {
    throw new Error("Retired commercial versions cannot be reactivated");
  }
}
