import { z } from "zod";
import {
  COMMERCIAL_BILLING_TERMS,
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_PLAN_CODES,
} from "./catalogue-contract";

/**
 * CC02.02 pricing contracts. Amounts are integer ISO-4217 minor units:
 * TZS 1.00 = 100 minor units; USD 1.00 = 100 minor units.
 * No FX conversion or cross-currency arithmetic is permitted.
 */
export const COMMERCIAL_PRICE_STATUSES = ["draft", "active", "retired"] as const;
export const COMMERCIAL_PRICE_MODES = ["fixed", "quote_required"] as const;
export const COMMERCIAL_ADDON_CHARGE_MODELS = ["flat", "per_property"] as const;

const amountMinor = z.number().int().safe().nonnegative();
const code = z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9_]*$/);
const isoDate = z.string().date();

const effectiveWindow = {
  effectiveFrom: isoDate.nullable(),
  effectiveTo: isoDate.nullable(),
};

function validateEffectiveWindow(
  value: { effectiveFrom: string | null; effectiveTo: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Effective end date must not precede effective start date",
    });
  }
}

export const commercialPlanPriceSchema = z.object({
  priceCode: code,
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  currency: z.enum(COMMERCIAL_CURRENCIES),
  billingTerm: z.enum(COMMERCIAL_BILLING_TERMS),
  priceMode: z.enum(COMMERCIAL_PRICE_MODES),
  baseAmountMinor: amountMinor.nullable(),
  includedProperties: z.number().int().positive(),
  additionalPropertyAmountMinor: amountMinor.nullable(),
  status: z.enum(COMMERCIAL_PRICE_STATUSES),
  ...effectiveWindow,
}).superRefine((value, ctx) => {
  validateEffectiveWindow(value, ctx);
  if (value.priceMode === "fixed" && (value.baseAmountMinor === null || value.additionalPropertyAmountMinor === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["baseAmountMinor"],
      message: "Fixed pricing requires base and additional-property amounts",
    });
  }
  if (value.priceMode === "quote_required" && (value.baseAmountMinor !== null || value.additionalPropertyAmountMinor !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["baseAmountMinor"],
      message: "Quote-required pricing must not carry public fixed amounts",
    });
  }
});
export type CommercialPlanPrice = z.infer<typeof commercialPlanPriceSchema>;

export const commercialAddonPriceSchema = z.object({
  priceCode: code,
  addonCode: code,
  currency: z.enum(COMMERCIAL_CURRENCIES),
  billingTerm: z.enum(COMMERCIAL_BILLING_TERMS),
  chargeModel: z.enum(COMMERCIAL_ADDON_CHARGE_MODELS),
  amountMinor,
  status: z.enum(COMMERCIAL_PRICE_STATUSES),
  ...effectiveWindow,
}).superRefine(validateEffectiveWindow);
export type CommercialAddonPrice = z.infer<typeof commercialAddonPriceSchema>;

export const commercialAddonSelectionSchema = z.object({
  addonCode: code,
});
export type CommercialAddonSelection = z.infer<typeof commercialAddonSelectionSchema>;

export const commercialPriceResolutionInputSchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  currency: z.enum(COMMERCIAL_CURRENCIES),
  billingTerm: z.enum(COMMERCIAL_BILLING_TERMS),
  propertyCount: z.number().int().positive(),
  asOf: isoDate,
  addons: z.array(commercialAddonSelectionSchema).default([]),
}).superRefine((value, ctx) => {
  const addonCodes = value.addons.map((addon) => addon.addonCode);
  if (new Set(addonCodes).size !== addonCodes.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["addons"],
      message: "An add-on may only be selected once per price resolution",
    });
  }
});
export type CommercialPriceResolutionInput = z.infer<typeof commercialPriceResolutionInputSchema>;
