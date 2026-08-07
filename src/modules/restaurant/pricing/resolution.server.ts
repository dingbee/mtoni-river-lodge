/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Loads the commercial rules in force and hands them to the pure engine.
 * Server-only. This is the single place the POS asks "what does it cost?".
 */
import { assertTenantRead } from "../core/access.server";
import {
  quoteLine,
  resolveFxRate,
  type ChargeRule,
  type PriceCandidate,
  type PricingContext,
  type PricingQuote,
  type PromotionRule,
} from "./engine";
import type { ResolvePriceInput } from "./contracts";

type Sb = any;

export type CommercialRuleSet = {
  prices: PriceCandidate[];
  promotions: PromotionRule[];
  taxes: ChargeRule[];
  serviceCharges: ChargeRule[];
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

export function toPriceCandidate(r: any): PriceCandidate {
  return {
    id: r.id,
    scope: r.scope,
    amount: Number(r.amount ?? 0),
    currency: r.currency,
    taxInclusive: Boolean(r.tax_inclusive),
    version: Number(r.version ?? 1),
    status: r.status,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to ?? null,
    propertyId: r.property_id ?? null,
    locationId: r.location_id ?? null,
    productId: r.product_id ?? null,
    variantId: r.variant_id ?? null,
    menuItemId: r.menu_item_id ?? null,
  };
}

function toPromotion(r: any): PromotionRule {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    action: r.action,
    value: Number(r.value ?? 0),
    status: r.status,
    priority: Number(r.priority ?? 100),
    stackable: Boolean(r.stackable),
    startsAt: r.starts_at,
    endsAt: r.ends_at ?? null,
    startTime: r.start_time ?? null,
    endTime: r.end_time ?? null,
    daysOfWeek: Array.isArray(r.days_of_week) ? r.days_of_week.map(Number) : [],
    propertyId: r.property_id ?? null,
    locationId: r.location_id ?? null,
    products: arr(r.applies_to_products),
    categories: arr(r.applies_to_categories),
  };
}

function toCharge(r: any, kind: "tax" | "service"): ChargeRule {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    basis: r.basis,
    rate: Number(r.rate ?? 0),
    fixedAmount: Number(r.fixed_amount ?? 0),
    inclusive: kind === "tax" ? Boolean(r.inclusive) : undefined,
    taxable: kind === "service" ? Boolean(r.taxable) : undefined,
    compound: Boolean(r.compound),
    priority: Number(r.priority ?? 100),
    active: Boolean(r.active),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to ?? null,
    propertyId: r.property_id ?? null,
    locationId: r.location_id ?? null,
    products: arr(r.applies_to_products),
    categories: arr(r.applies_to_categories),
    orderTypes: kind === "service" ? arr(r.applies_to_order_types) : [],
  };
}

/** One round-trip per rule family; reused across every line of an order. */
export async function loadRuleSet(
  sb: Sb,
  tenantId: string,
  opts: { menuItemIds?: string[]; productIds?: string[] } = {},
): Promise<CommercialRuleSet> {
  const menuItemIds = [...new Set(opts.menuItemIds ?? [])];
  const productIds = [...new Set(opts.productIds ?? [])];

  let priceQuery = sb
    .from("restaurant_prices")
    .select(
      "id, scope, amount, currency, tax_inclusive, version, status, effective_from, effective_to, property_id, location_id, product_id, variant_id, menu_item_id",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (menuItemIds.length > 0 && productIds.length === 0) {
    priceQuery = priceQuery.in("menu_item_id", menuItemIds);
  } else if (productIds.length > 0 && menuItemIds.length === 0) {
    priceQuery = priceQuery.in("product_id", productIds);
  }

  const [prices, promos, taxes, svc] = await Promise.all([
    priceQuery,
    sb.from("restaurant_promotions").select("*").eq("tenant_id", tenantId).eq("status", "active"),
    sb.from("restaurant_tax_rules").select("*").eq("tenant_id", tenantId).eq("active", true),
    sb.from("restaurant_service_charges").select("*").eq("tenant_id", tenantId).eq("active", true),
  ]);

  return {
    prices: ((prices.data ?? []) as any[]).map(toPriceCandidate),
    promotions: ((promos.data ?? []) as any[]).map(toPromotion),
    taxes: ((taxes.data ?? []) as any[]).map((r) => toCharge(r, "tax")),
    serviceCharges: ((svc.data ?? []) as any[]).map((r) => toCharge(r, "service")),
  };
}

export function quoteWithRuleSet(
  rules: CommercialRuleSet,
  ctx: PricingContext,
  fallback: { unitPrice?: number; currency?: string; lineDiscount?: number } = {},
): PricingQuote {
  const scoped = rules.prices.filter((p) =>
    ctx.menuItemId
      ? p.menuItemId === ctx.menuItemId || (ctx.productId ? p.productId === ctx.productId : false)
      : ctx.productId
        ? p.productId === ctx.productId
        : false,
  );
  return quoteLine({
    ctx,
    prices: scoped,
    promotions: rules.promotions,
    taxes: rules.taxes,
    serviceCharges: rules.serviceCharges,
    fallbackUnitPrice: fallback.unitPrice,
    fallbackCurrency: fallback.currency,
    lineDiscount: fallback.lineDiscount,
  });
}

/** Explainable single-item resolution used by the Pricing Centre preview. */
export async function resolvePrice(sb: Sb, userId: string, input: ResolvePriceInput) {
  await assertTenantRead(sb, userId, input.tenantId);
  const rules = await loadRuleSet(sb, input.tenantId, {
    menuItemIds: input.menuItemId ? [input.menuItemId] : [],
    productIds: input.productId ? [input.productId] : [],
  });
  const ctx: PricingContext = {
    at: input.at ? new Date(input.at) : new Date(),
    propertyId: input.propertyId ?? null,
    locationId: input.locationId ?? null,
    productId: input.productId ?? null,
    variantId: input.variantId ?? null,
    menuItemId: input.menuItemId ?? null,
    categoryId: input.categoryId ?? null,
    orderType: input.orderType,
    quantity: input.quantity,
  };
  const quote = quoteWithRuleSet(rules, ctx);
  return { quote, context: { ...ctx, at: ctx.at.toISOString() } };
}

/** Rate in force now; callers snapshot it onto the transaction. */
export async function currentFxRate(
  sb: Sb,
  tenantId: string,
  base: string,
  target: string,
  at = new Date(),
): Promise<number> {
  if (base === target) return 1;
  const { data } = await sb
    .from("restaurant_exchange_rates")
    .select("base_currency, target_currency, rate, effective_from")
    .eq("tenant_id", tenantId)
    .lte("effective_from", at.toISOString())
    .order("effective_from", { ascending: false })
    .limit(200);
  const rate = resolveFxRate(
    ((data ?? []) as any[]).map((r) => ({
      baseCurrency: r.base_currency,
      targetCurrency: r.target_currency,
      rate: Number(r.rate),
      effectiveFrom: r.effective_from,
    })),
    base,
    target,
    at,
  );
  return rate ?? 1;
}
