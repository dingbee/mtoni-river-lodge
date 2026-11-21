/**
 * Reconciles the price a guest saw in search results with the server quote that
 * the reservation is created from. Both come from the same published rate plan
 * calculation; a difference means rates changed between search and checkout,
 * and the guest must see the current price before requesting the reservation.
 */

export type SearchedPlanAmounts = {
  total: number;
  average_nightly_rate: number;
  currency: string;
  nightly_breakdown?: Array<{ date: string; nightly_rate: number }>;
};

export type QuoteAmounts = {
  accommodation_subtotal?: number | null;
  extras_total?: number | null;
  fee_total?: number | null;
  discount_total?: number | null;
  taxes?: number | null;
  tax_addition?: number | null;
  total?: number | null;
  currency?: string | null;
  quote_expires_at?: string | null;
};

const CENT = 0.005;

export function reconcileQuote(plan: SearchedPlanAmounts, quote: QuoteAmounts) {
  const searched = Number(plan.total);
  const quoted = Number(quote.accommodation_subtotal);
  const sameCurrency = String(plan.currency ?? "").toUpperCase() === String(quote.currency ?? "").toUpperCase();
  const amountsValid = Number.isFinite(searched) && Number.isFinite(quoted) && searched > 0 && quoted > 0;
  const components = [quote.extras_total, quote.fee_total, quote.tax_addition, quote.discount_total].map((value) => Number(value ?? 0));
  return {
    searched,
    quoted,
    /** Accommodation in the quote equals the amount shown in search, in the same currency. */
    matches: sameCurrency && amountsValid && Math.abs(searched - quoted) < CENT,
    noAdditionalCharges: components.every((value) => value === 0) && Number(quote.taxes ?? 0) === 0,
  };
}
