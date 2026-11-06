import type {
  CommercialAddonPrice,
  CommercialPriceResolutionInput,
  CommercialPlanPrice,
} from "./pricing-contract";
import { commercialPriceResolutionInputSchema } from "./pricing-contract";

export interface CommercialPriceLine {
  kind: "plan_base" | "additional_property" | "addon";
  code: string;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface CommercialPriceResolution {
  planCode: CommercialPriceResolutionInput["planCode"];
  planVersion: number;
  planPriceCode: string;
  currency: CommercialPriceResolutionInput["currency"];
  billingTerm: CommercialPriceResolutionInput["billingTerm"];
  propertyCount: number;
  asOf: string;
  lines: CommercialPriceLine[];
  totalAmountMinor: number | null;
  quoteRequired: boolean;
  requestedAddonCodes: string[];
}

/** Resolve one exact currency/term/version price; never perform FX conversion. */
export function resolveCommercialPrice(
  rawInput: CommercialPriceResolutionInput,
  planPrices: readonly CommercialPlanPrice[],
  addonPrices: readonly CommercialAddonPrice[],
): CommercialPriceResolution {
  const input = commercialPriceResolutionInputSchema.parse(rawInput);
  const matchingPlanPrices = planPrices.filter((price) =>
    price.planCode === input.planCode
    && price.planVersion === input.planVersion
    && price.currency === input.currency
    && price.billingTerm === input.billingTerm
    && price.status === "active"
    && isEffective(price.effectiveFrom, price.effectiveTo, input.asOf),
  );

  if (matchingPlanPrices.length !== 1) {
    throw new Error(matchingPlanPrices.length === 0
      ? "No active plan price exists for the requested version, currency, term and date"
      : "Ambiguous plan pricing: multiple active prices match the requested dimensions");
  }

  const planPrice = matchingPlanPrices[0];
  if (!planPrice) throw new Error("Plan price resolution failed");
  if (planPrice.priceMode === "quote_required") {
    return {
      planCode: input.planCode,
      planVersion: input.planVersion,
      planPriceCode: planPrice.priceCode,
      currency: input.currency,
      billingTerm: input.billingTerm,
      propertyCount: input.propertyCount,
      asOf: input.asOf,
      lines: [],
      totalAmountMinor: null,
      quoteRequired: true,
      requestedAddonCodes: input.addons.map((addon) => addon.addonCode),
    };
  }

  if (planPrice.baseAmountMinor === null || planPrice.additionalPropertyAmountMinor === null || planPrice.includedProperties === null) {
    throw new Error("Fixed plan price is missing a required amount");
  }

  const lines: CommercialPriceLine[] = [{
    kind: "plan_base",
    code: planPrice.priceCode,
    description: `${input.planCode} base subscription (${planPrice.includedProperties} included properties)`,
    quantity: 1,
    unitAmountMinor: planPrice.baseAmountMinor,
    amountMinor: planPrice.baseAmountMinor,
  }];

  const additionalProperties = Math.max(0, input.propertyCount - planPrice.includedProperties);
  if (additionalProperties > 0) {
    const amountMinor = safeMultiply(additionalProperties, planPrice.additionalPropertyAmountMinor);
    lines.push({
      kind: "additional_property",
      code: planPrice.priceCode,
      description: "Additional properties",
      quantity: additionalProperties,
      unitAmountMinor: planPrice.additionalPropertyAmountMinor,
      amountMinor,
    });
  }

  for (const selection of input.addons) {
    const matches = addonPrices.filter((price) =>
      price.addonCode === selection.addonCode
      && price.currency === input.currency
      && price.billingTerm === input.billingTerm
      && price.status === "active"
      && isEffective(price.effectiveFrom, price.effectiveTo, input.asOf),
    );
    if (matches.length !== 1) {
      throw new Error(matches.length === 0
        ? `No active add-on price exists for ${selection.addonCode} in the requested currency, term and date`
        : `Ambiguous add-on pricing for ${selection.addonCode}`);
    }
    const addonPrice = matches[0];
    if (!addonPrice) throw new Error(`Add-on price resolution failed for ${selection.addonCode}`);
    const quantity = addonPrice.chargeModel === "per_property" ? input.propertyCount : 1;
    lines.push({
      kind: "addon",
      code: addonPrice.addonCode,
      description: addonPrice.addonCode,
      quantity,
      unitAmountMinor: addonPrice.amountMinor,
      amountMinor: safeMultiply(quantity, addonPrice.amountMinor),
    });
  }

  const totalAmountMinor = lines.reduce((sum, line) => safeAdd(sum, line.amountMinor), 0);
  return {
    planCode: input.planCode,
    planVersion: input.planVersion,
    planPriceCode: planPrice.priceCode,
    currency: input.currency,
    billingTerm: input.billingTerm,
    propertyCount: input.propertyCount,
    asOf: input.asOf,
    lines,
    totalAmountMinor,
    quoteRequired: false,
    requestedAddonCodes: input.addons.map((addon) => addon.addonCode),
  };
}

function isEffective(from: string | null, to: string | null, asOf: string): boolean {
  return (!from || from <= asOf) && (!to || to >= asOf);
}

function safeMultiply(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new Error("Commercial price exceeds safe integer range");
  return result;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error("Commercial price exceeds safe integer range");
  return result;
}
