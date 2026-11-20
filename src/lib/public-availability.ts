/* eslint-disable @typescript-eslint/no-explicit-any -- availability rows come from an untyped RPC contract */

export type PublicPricingProperty = { name: string; currency: string };

/**
 * Catalogue rooms: an indicative legacy room rate is published only when it is
 * denominated in the property currency. An amount is never shown with a currency
 * it was not entered in.
 */
export function toPublicCatalogRoom(room: any, property: PublicPricingProperty) {
  const inPropertyCurrency = String(room.currency ?? "").toUpperCase() === property.currency;
  return {
    ...room,
    currency: property.currency,
    base_price: inPropertyCurrency && Number(room.base_price) > 0 ? Number(room.base_price) : null,
    extra_guest_fee: inPropertyCurrency ? Number(room.extra_guest_fee ?? 0) : null,
  };
}

/**
 * Maps priced availability rows for the guest booking page. The priced amount and
 * its currency always travel together: the quote currency labels the quote total.
 * Genuine pricing failures are surfaced, never hidden behind a generic message.
 */
export function mapPublicAvailability(
  rows: any[],
  planOptionsByRoom: Map<string, Array<{ currency?: string }>>,
  property: PublicPricingProperty,
) {
  // A published plan is not required to cover every room type. A room with
  // NO_ELIGIBLE_RATE_PLAN is simply not sellable for this stay; it must not poison
  // the response for other room types. All other resolver failures fail closed.
  const pricingFailure = rows.find((room) =>
    room.pricing_quote?.ok === false
    && !["RATE_PLAN_REQUIRED", "NO_ELIGIBLE_RATE_PLAN"].includes(room.pricing_quote?.error_code),
  );
  if (pricingFailure) {
    throw new Error(`Pricing rejected [${pricingFailure.pricing_quote.error_code ?? "INVALID_RATE_CONFIGURATION"}]: ${pricingFailure.pricing_quote.message ?? "Pricing configuration is invalid"}`);
  }

  return rows
    .filter((room) => {
      const errorCode = room.pricing_quote?.error_code;
      if (errorCode === "NO_ELIGIBLE_RATE_PLAN") return false;
      if (errorCode === "RATE_PLAN_REQUIRED") return (planOptionsByRoom.get(room.room_id) ?? []).length > 0;
      return true;
    })
    .map((room) => {
      const quoteCurrency = String(room.pricing_quote?.currency ?? room.currency ?? "").toUpperCase();
      if (room.pricing_quote?.ok !== false && quoteCurrency !== property.currency) {
        throw new Error(`Pricing rejected [CURRENCY_MISMATCH]: ${room.name} is priced in ${quoteCurrency || "an unknown currency"} but ${property.name} sells in ${property.currency}`);
      }
      const plans = planOptionsByRoom.get(room.room_id) ?? [];
      if (plans.some((plan) => String(plan.currency ?? "").toUpperCase() !== property.currency)) {
        throw new Error(`Pricing rejected [CURRENCY_MISMATCH]: a published rate plan for ${room.name} is not priced in ${property.currency}`);
      }
      return {
        rate_plan_options: plans,
        ...room,
        currency: property.currency,
        base_price: room.base_price === null || room.base_price === undefined ? null : Number(room.base_price),
        nightly_total: room.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(room.pricing_quote?.total ?? room.nightly_total),
        pricing_quote: room.pricing_quote,
        fits_guests: Boolean(room.fits_occupancy),
      };
    })
    .filter((room) => room.is_available && room.fits_guests)
    .sort((a, b) => (a.nightly_total ?? Number.POSITIVE_INFINITY) - (b.nightly_total ?? Number.POSITIVE_INFINITY));
}

/**
 * Per-night price for the guest's searched dates, taken from the priced quote's
 * nightly breakdown (exact amounts, no division or rounding). Returns the rate when
 * every night costs the same, otherwise the lowest night as a "from" price.
 */
export function searchedNightlyRate(room: any): { amount: number; currency: string; uniform: boolean } | null {
  const quote = room?.pricing_quote;
  if (!quote || quote.ok === false || !room.currency) return null;
  const rates = (Array.isArray(quote.nightly) ? quote.nightly : [])
    .map((night: any) => Number(night?.nightly_rate))
    .filter((rate: number) => Number.isFinite(rate) && rate > 0);
  if (!rates.length) return null;
  const lowest = Math.min(...rates);
  return { amount: lowest, currency: room.currency, uniform: rates.every((rate: number) => rate === lowest) };
}
