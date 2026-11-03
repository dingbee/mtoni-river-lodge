export type CurrencyAmountRow = {
  total: number | string | null;
  currency: string | null;
  status?: string | null;
};

/** Aggregate monetary values without ever combining unlike currencies. */
export function sumByCurrency(rows: readonly CurrencyAmountRow[] | null | undefined): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows ?? []) {
    if (row.status === "cancelled") continue;
    const currency = String(row.currency || "UNKNOWN").trim().toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + Number(row.total ?? 0));
  }
  return totals;
}

/** Outstanding balance is non-negative and derived from the booking's total less paid amount. */
export function deriveOutstandingBalance(total: number | string | null, paid: number | string | null): number {
  return Math.max(0, Number(total ?? 0) - Number(paid ?? 0));
}

export function hasBalanceMismatch(stored: number | string | null, derived: number, tolerance = 0.01): boolean {
  return Math.abs(Number(stored ?? 0) - derived) > tolerance;
}
