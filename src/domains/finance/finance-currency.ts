import { totalsByCurrency } from "@/lib/money";

// Per-currency totals use exact minor-unit arithmetic; currencies are never merged.
export function sumCurrency(rows: Array<{ currency?: string | null; amount?: number | string | null }>) {
  return totalsByCurrency(rows, (row) => row.currency, (row) => row.amount ?? 0);
}
export function moneyByCurrency<T extends { currency?: string | null }>(
  rows: T[],
  value: (row: T) => number,
) {
  return totalsByCurrency(rows, (row) => row.currency, value);
}
