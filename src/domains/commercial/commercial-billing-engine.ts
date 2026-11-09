export type CommercialBillingTerm = "monthly" | "annual";

export interface CommercialBillingPeriod {
  startsAt: string;
  endsAt: string;
  term: CommercialBillingTerm;
}

/** Add a calendar month/year in UTC, clamping month-end dates instead of overflowing. */
export function nextCommercialBillingPeriod(
  startsAt: string,
  term: CommercialBillingTerm,
): CommercialBillingPeriod {
  const start = new Date(startsAt);
  if (!Number.isFinite(start.getTime())) throw new Error("Billing period start is invalid.");
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetMonthIndex = term === "monthly" ? month + 1 : month;
  const targetYear = term === "monthly" ? year + Math.floor(targetMonthIndex / 12) : year + 1;
  const normalizedMonth = term === "monthly" ? targetMonthIndex % 12 : month;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const end = new Date(start.getTime());
  end.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, lastDay));
  if (end.getTime() <= start.getTime()) throw new Error("Calculated billing period is not positive.");
  return { startsAt: start.toISOString(), endsAt: end.toISOString(), term };
}

/**
 * Proration is opt-in and requires a contractually supplied fraction.
 * Integer arithmetic and the named rounding policy prevent floating-point money.
 */
export function calculateCommercialProration(input: {
  fullAmountMinor: number;
  billableUnits: number;
  totalUnits: number;
  rounding: "half_up" | "floor";
}): number {
  const { fullAmountMinor, billableUnits, totalUnits, rounding } = input;
  if (!Number.isSafeInteger(fullAmountMinor) || fullAmountMinor < 0
    || !Number.isSafeInteger(billableUnits) || billableUnits < 0
    || !Number.isSafeInteger(totalUnits) || totalUnits <= 0
    || billableUnits > totalUnits) {
    throw new Error("Proration inputs are invalid.");
  }
  const numerator = BigInt(fullAmountMinor) * BigInt(billableUnits);
  const denominator = BigInt(totalUnits);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = rounding === "half_up" && remainder * 2n >= denominator ? quotient + 1n : quotient;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error("Prorated amount exceeds safe integer range.");
  return result;
}
