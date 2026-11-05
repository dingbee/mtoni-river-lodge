import { describe, expect, it } from "vitest";
import type { CommercialAddonPrice, CommercialPlanPrice } from "./pricing-contract";
import {
  commercialAddonPriceSchema,
  commercialPlanPriceSchema,
  commercialPriceResolutionInputSchema,
} from "./pricing-contract";
import { resolveCommercialPrice } from "./pricing-engine";

const planPrice: CommercialPlanPrice = {
  priceCode: "professional_tzs_monthly_v1",
  planCode: "professional",
  planVersion: 1,
  currency: "TZS",
  billingTerm: "monthly",
  priceMode: "fixed",
  baseAmountMinor: 100_000_00,
  includedProperties: 2,
  additionalPropertyAmountMinor: 25_000_00,
  status: "active",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

const addonPrice: CommercialAddonPrice = {
  priceCode: "advanced_analytics_tzs_monthly_v1",
  addonCode: "advanced_analytics",
  currency: "TZS",
  billingTerm: "monthly",
  chargeModel: "per_property",
  amountMinor: 10_000_00,
  status: "active",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

const input = {
  planCode: "professional" as const,
  planVersion: 1,
  currency: "TZS" as const,
  billingTerm: "monthly" as const,
  propertyCount: 3,
  asOf: "2026-11-05",
  addons: [{ addonCode: "advanced_analytics" }],
};

describe("CC02.02 commercial pricing architecture", () => {
  it("validates fixed plan prices as integer minor units with hybrid property basis", () => {
    expect(commercialPlanPriceSchema.safeParse(planPrice).success).toBe(true);
    expect(commercialPlanPriceSchema.safeParse({
      ...planPrice,
      baseAmountMinor: 100.5,
    }).success).toBe(false);
    expect(commercialPlanPriceSchema.safeParse({
      ...planPrice,
      additionalPropertyAmountMinor: null,
    }).success).toBe(false);
  });

  it("requires quote-only prices to contain no public fixed amounts", () => {
    expect(commercialPlanPriceSchema.safeParse({
      ...planPrice,
      planCode: "enterprise",
      priceMode: "quote_required",
      baseAmountMinor: null,
      additionalPropertyAmountMinor: null,
    }).success).toBe(true);
    expect(commercialPlanPriceSchema.safeParse({
      ...planPrice,
      planCode: "enterprise",
      priceMode: "quote_required",
    }).success).toBe(false);
  });

  it("validates add-on charge models and effective date ranges", () => {
    expect(commercialAddonPriceSchema.safeParse(addonPrice).success).toBe(true);
    expect(commercialAddonPriceSchema.safeParse({
      ...addonPrice,
      effectiveFrom: "2026-12-01",
      effectiveTo: "2026-01-01",
    }).success).toBe(false);
  });

  it("rejects duplicate add-on selections", () => {
    expect(commercialPriceResolutionInputSchema.safeParse({
      ...input,
      addons: [{ addonCode: "advanced_analytics" }, { addonCode: "advanced_analytics" }],
    }).success).toBe(false);
  });

  it("resolves base, additional-property and per-property add-on amounts", () => {
    const result = resolveCommercialPrice(input, [planPrice], [addonPrice]);
    expect(result.totalAmountMinor).toBe(135_000_00);
    expect(result.lines.map((line) => [line.kind, line.quantity, line.amountMinor])).toEqual([
      ["plan_base", 1, 100_000_00],
      ["additional_property", 1, 25_000_00],
      ["addon", 3, 30_000_00],
    ]);
    expect(result.currency).toBe("TZS");
    expect(result.quoteRequired).toBe(false);
  });

  it("never falls back or converts when requested currency is unavailable", () => {
    expect(() => resolveCommercialPrice({
      ...input,
      currency: "USD",
    }, [planPrice], [addonPrice])).toThrow(/No active plan price/);
  });

  it("requires an exact active price and rejects ambiguous matches", () => {
    expect(() => resolveCommercialPrice(input, [], [addonPrice])).toThrow(/No active plan price/);
    expect(() => resolveCommercialPrice(input, [planPrice, planPrice], [addonPrice])).toThrow(/Ambiguous plan pricing/);
  });

  it("returns a quote-required result without fabricating a total", () => {
    const enterpriseQuote: CommercialPlanPrice = {
      ...planPrice,
      priceCode: "enterprise_quote_v1",
      planCode: "enterprise",
      priceMode: "quote_required",
      baseAmountMinor: null,
      additionalPropertyAmountMinor: null,
    };
    const result = resolveCommercialPrice({
      ...input,
      planCode: "enterprise",
      addons: [],
    }, [enterpriseQuote], []);
    expect(result.quoteRequired).toBe(true);
    expect(result.totalAmountMinor).toBeNull();
    expect(result.lines).toEqual([]);
    expect(result.requestedAddonCodes).toEqual([]);
  });

  it("rejects unsafe arithmetic overflow", () => {
    const oversized: CommercialPlanPrice = {
      ...planPrice,
      baseAmountMinor: Number.MAX_SAFE_INTEGER,
      additionalPropertyAmountMinor: 1,
      includedProperties: 1,
    };
    expect(() => resolveCommercialPrice({
      ...input,
      addons: [],
    }, [oversized], [])).toThrow(/safe integer range/);
  });
});
