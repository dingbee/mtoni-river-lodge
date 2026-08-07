/**
 * Deterministic commercial pricing engine (pure, browser-safe, testable).
 *
 * Given a set of candidate prices, promotions, taxes, service charges and a
 * pricing context, it produces exactly one answer plus the reason for it. No
 * database, no side effects, no reasoning: the Intelligence Core reasons, this
 * file only computes.
 */
import type { ChargeBasis, PriceScope, PromotionAction } from "./contracts";

export type PriceCandidate = {
  id: string;
  scope: PriceScope;
  amount: number;
  currency: string;
  taxInclusive: boolean;
  version: number;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  propertyId: string | null;
  locationId: string | null;
  productId: string | null;
  variantId: string | null;
  menuItemId: string | null;
};

export type PromotionRule = {
  id: string;
  code: string;
  name: string;
  action: PromotionAction;
  value: number;
  status: string;
  priority: number;
  stackable: boolean;
  startsAt: string;
  endsAt: string | null;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: number[];
  propertyId: string | null;
  locationId: string | null;
  products: string[];
  categories: string[];
};

export type ChargeRule = {
  id: string;
  code: string;
  name: string;
  basis: ChargeBasis;
  rate: number;
  fixedAmount: number;
  inclusive?: boolean;
  taxable?: boolean;
  compound?: boolean;
  priority?: number;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  propertyId: string | null;
  locationId: string | null;
  products: string[];
  categories: string[];
  orderTypes?: string[];
};

export type PricingContext = {
  at: Date;
  propertyId?: string | null;
  locationId?: string | null;
  productId?: string | null;
  variantId?: string | null;
  menuItemId?: string | null;
  categoryId?: string | null;
  orderType?: string;
  quantity: number;
};

export type PricingTrace = {
  step: string;
  detail: string;
  amount: number;
};

export type PricingQuote = {
  currency: string;
  basePrice: number;
  priceId: string | null;
  priceSource: string;
  unitPrice: number;
  promotionId: string | null;
  promotionDiscount: number;
  lineNet: number;
  serviceCharge: number;
  serviceChargeId: string | null;
  taxTotal: number;
  taxRuleId: string | null;
  taxRate: number;
  taxInclusive: boolean;
  lineTotal: number;
  trace: PricingTrace[];
};

const round = (n: number, dp = 4) => Number(n.toFixed(dp));
const money = (n: number) => Number(n.toFixed(2));

function withinDates(from: string, to: string | null, at: Date): boolean {
  if (new Date(from).getTime() > at.getTime()) return false;
  if (to && new Date(to).getTime() < at.getTime()) return false;
  return true;
}

function withinScope(
  propertyId: string | null,
  locationId: string | null,
  ctx: PricingContext,
): boolean {
  if (locationId && locationId !== (ctx.locationId ?? null)) return false;
  if (propertyId && propertyId !== (ctx.propertyId ?? null)) return false;
  return true;
}

function targets(products: string[], categories: string[], ctx: PricingContext): boolean {
  if (products.length === 0 && categories.length === 0) return true;
  if (ctx.productId && products.includes(ctx.productId)) return true;
  if (ctx.menuItemId && products.includes(ctx.menuItemId)) return true;
  if (ctx.categoryId && categories.includes(ctx.categoryId)) return true;
  return false;
}

const SCOPE_WEIGHT: Record<PriceScope, number> = { tenant: 0, property: 1, location: 2 };

/**
 * Hierarchy: tenant default → property override → outlet override. The most
 * specific applicable, effective, active price wins; ties break on the latest
 * effective date, then the highest version.
 */
export function resolveBasePrice(
  candidates: PriceCandidate[],
  ctx: PricingContext,
): PriceCandidate | null {
  const eligible = candidates.filter(
    (c) =>
      c.status === "active" &&
      withinDates(c.effectiveFrom, c.effectiveTo, ctx.at) &&
      withinScope(c.propertyId, c.locationId, ctx) &&
      (ctx.variantId ? c.variantId === ctx.variantId || c.variantId === null : true),
  );
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const s = SCOPE_WEIGHT[b.scope] - SCOPE_WEIGHT[a.scope];
    if (s !== 0) return s;
    // A variant-specific price beats a product-wide one at the same scope.
    const v = Number(Boolean(b.variantId)) - Number(Boolean(a.variantId));
    if (v !== 0) return v;
    const d = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    if (d !== 0) return d;
    return b.version - a.version;
  });
  return eligible[0] ?? null;
}

function timeWithin(start: string | null, end: string | null, at: Date): boolean {
  if (!start || !end) return true;
  const mins = at.getHours() * 60 + at.getMinutes();
  const toMin = (t: string) => {
    const [h = "0", m = "0"] = t.split(":");
    return Number(h) * 60 + Number(m);
  };
  const s = toMin(start);
  const e = toMin(end);
  // A window that crosses midnight (e.g. 22:00 → 02:00) stays contiguous.
  return s <= e ? mins >= s && mins <= e : mins >= s || mins <= e;
}

export function applicablePromotions(
  promotions: PromotionRule[],
  ctx: PricingContext,
): PromotionRule[] {
  return promotions
    .filter(
      (p) =>
        p.status === "active" &&
        withinDates(p.startsAt, p.endsAt, ctx.at) &&
        withinScope(p.propertyId, p.locationId, ctx) &&
        (p.daysOfWeek.length === 0 || p.daysOfWeek.includes(ctx.at.getDay())) &&
        timeWithin(p.startTime, p.endTime, ctx.at) &&
        targets(p.products, p.categories, ctx),
    )
    .sort((a, b) => a.priority - b.priority || a.code.localeCompare(b.code));
}

export function applyPromotion(unitPrice: number, promo: PromotionRule): number {
  switch (promo.action) {
    case "percent_discount":
      return round(unitPrice * (1 - promo.value / 100));
    case "fixed_discount":
      return round(Math.max(0, unitPrice - promo.value));
    case "price_override":
      return round(promo.value);
    case "percent_uplift":
      return round(unitPrice * (1 + promo.value / 100));
    default:
      return unitPrice;
  }
}

export function applicableCharges(rules: ChargeRule[], ctx: PricingContext): ChargeRule[] {
  return rules
    .filter(
      (r) =>
        r.active &&
        withinDates(r.effectiveFrom, r.effectiveTo, ctx.at) &&
        withinScope(r.propertyId, r.locationId, ctx) &&
        targets(r.products, r.categories, ctx) &&
        (!r.orderTypes ||
          r.orderTypes.length === 0 ||
          r.orderTypes.includes(ctx.orderType ?? "dine_in")),
    )
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.code.localeCompare(b.code));
}

function chargeAmount(rule: ChargeRule, base: number, quantity: number): number {
  return rule.basis === "percent"
    ? round(base * (rule.rate / 100))
    : round(rule.fixedAmount * quantity);
}

/**
 * Tax on an exclusive line is added on top; on an inclusive line it is
 * extracted from the amount the customer already pays.
 */
export function computeTax(
  rules: ChargeRule[],
  base: number,
  quantity: number,
  inclusive: boolean,
): { total: number; rate: number; ruleId: string | null; net: number } {
  if (rules.length === 0) return { total: 0, rate: 0, ruleId: null, net: round(base) };
  const percentRate = rules.filter((r) => r.basis === "percent").reduce((s, r) => s + r.rate, 0);
  const fixed = rules
    .filter((r) => r.basis === "fixed")
    .reduce((s, r) => s + r.fixedAmount * quantity, 0);
  if (inclusive) {
    const net = round((base - fixed) / (1 + percentRate / 100));
    return { total: round(base - net), rate: percentRate, ruleId: rules[0]?.id ?? null, net };
  }
  return {
    total: round(base * (percentRate / 100) + fixed),
    rate: percentRate,
    ruleId: rules[0]?.id ?? null,
    net: round(base),
  };
}

/** The single, explainable answer for one order line. */
export function quoteLine(args: {
  ctx: PricingContext;
  prices: PriceCandidate[];
  promotions: PromotionRule[];
  taxes: ChargeRule[];
  serviceCharges: ChargeRule[];
  fallbackUnitPrice?: number;
  fallbackCurrency?: string;
  lineDiscount?: number;
}): PricingQuote {
  const { ctx, prices, promotions, taxes, serviceCharges } = args;
  const trace: PricingTrace[] = [];

  const base = resolveBasePrice(prices, ctx);
  const currency = base?.currency ?? args.fallbackCurrency ?? "USD";
  const basePrice = base ? base.amount : (args.fallbackUnitPrice ?? 0);
  trace.push({
    step: "base_price",
    detail: base ? `${base.scope} price v${base.version}` : "no configured price — fallback used",
    amount: basePrice,
  });

  let unitPrice = basePrice;
  let promotionId: string | null = null;
  for (const promo of applicablePromotions(promotions, ctx)) {
    const next = applyPromotion(unitPrice, promo);
    trace.push({
      step: "promotion",
      detail: `${promo.name} (${promo.action} ${promo.value})`,
      amount: next,
    });
    unitPrice = next;
    promotionId = promo.id;
    if (!promo.stackable) break;
  }

  const gross = round(unitPrice * ctx.quantity);
  const discount = round(Math.min(args.lineDiscount ?? 0, gross));
  const afterDiscount = round(gross - discount);
  if (discount > 0) trace.push({ step: "discount", detail: "line discount", amount: -discount });

  const svcRules = applicableCharges(serviceCharges, ctx);
  const svc = svcRules.reduce((s, r) => s + chargeAmount(r, afterDiscount, ctx.quantity), 0);
  if (svc > 0)
    trace.push({
      step: "service_charge",
      detail: svcRules.map((r) => r.code).join(", "),
      amount: svc,
    });

  const taxRules = applicableCharges(taxes, ctx);
  const inclusive = base?.taxInclusive ?? taxRules.some((r) => r.inclusive);
  const taxableBase =
    afterDiscount +
    svcRules
      .filter((r) => r.taxable)
      .reduce((s, r) => s + chargeAmount(r, afterDiscount, ctx.quantity), 0);
  const tax = computeTax(taxRules, taxableBase, ctx.quantity, inclusive);
  if (tax.total > 0) {
    trace.push({
      step: "tax",
      detail: `${taxRules.map((r) => r.code).join(", ")} ${inclusive ? "(inclusive)" : "(exclusive)"}`,
      amount: tax.total,
    });
  }

  const lineTotal = inclusive ? money(afterDiscount + svc) : money(afterDiscount + svc + tax.total);
  trace.push({ step: "line_total", detail: currency, amount: lineTotal });

  return {
    currency,
    basePrice: round(basePrice),
    priceId: base?.id ?? null,
    priceSource: base ? base.scope : "fallback",
    unitPrice: round(unitPrice),
    promotionId,
    promotionDiscount: round(Math.max(0, basePrice - unitPrice) * ctx.quantity),
    lineNet: inclusive ? tax.net : afterDiscount,
    serviceCharge: money(svc),
    serviceChargeId: svcRules[0]?.id ?? null,
    taxTotal: money(tax.total),
    taxRuleId: tax.ruleId,
    taxRate: tax.rate,
    taxInclusive: inclusive,
    lineTotal,
    trace,
  };
}

/* ---------------- Discount governance ---------------- */

export type DiscountGovernanceRule = {
  maxPercent: number;
  roleLimits: Record<string, number>;
  approvalThresholdPercent: number | null;
  requiresReason: boolean;
};

/** The highest percentage these roles may grant without an exception. */
export function discountCeiling(rule: DiscountGovernanceRule, roles: readonly string[]): number {
  const limits = roles
    .map((r) => rule.roleLimits[r])
    .filter((v): v is number => typeof v === "number");
  const roleCeiling = limits.length > 0 ? Math.max(...limits) : rule.maxPercent;
  return Math.min(rule.maxPercent, roleCeiling);
}

export function evaluateDiscount(args: {
  rule: DiscountGovernanceRule;
  roles: readonly string[];
  basis: ChargeBasis;
  value: number;
  lineBase: number;
  reason?: string | null;
  platformAdmin?: boolean;
}): {
  allowed: boolean;
  requiresApproval: boolean;
  percent: number;
  amount: number;
  message?: string;
} {
  const percent =
    args.basis === "percent"
      ? args.value
      : args.lineBase > 0
        ? (args.value / args.lineBase) * 100
        : 100;
  const amount =
    args.basis === "percent" ? round(args.lineBase * (args.value / 100)) : round(args.value);
  const ceiling = discountCeiling(args.rule, args.roles);
  if (args.rule.requiresReason && !args.reason?.trim()) {
    return {
      allowed: false,
      requiresApproval: false,
      percent,
      amount,
      message: "A reason is required for this discount.",
    };
  }
  if (!args.platformAdmin && percent > ceiling) {
    return {
      allowed: false,
      requiresApproval: true,
      percent,
      amount,
      message: `Your role may grant up to ${ceiling}% — ${percent.toFixed(1)}% needs approval.`,
    };
  }
  const threshold = args.rule.approvalThresholdPercent;
  return {
    allowed: true,
    requiresApproval: threshold !== null && threshold !== undefined && percent > threshold,
    percent,
    amount,
  };
}

/* ---------------- Currency ---------------- */

export type FxRate = {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  effectiveFrom: string;
};

/** The rate in force at `at`. Historical transactions keep the rate they stored. */
export function resolveFxRate(
  rates: FxRate[],
  base: string,
  target: string,
  at: Date,
): number | null {
  if (base === target) return 1;
  const direct = rates
    .filter(
      (r) =>
        r.baseCurrency === base && r.targetCurrency === target && new Date(r.effectiveFrom) <= at,
    )
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
  if (direct) return direct.rate;
  const inverse = rates
    .filter(
      (r) =>
        r.baseCurrency === target && r.targetCurrency === base && new Date(r.effectiveFrom) <= at,
    )
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
  return inverse && inverse.rate !== 0 ? round(1 / inverse.rate, 8) : null;
}

export function convert(amount: number, rate: number, decimals = 2): number {
  return Number((amount * rate).toFixed(decimals));
}
