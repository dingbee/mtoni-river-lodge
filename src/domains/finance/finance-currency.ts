export function sumCurrency(rows: Array<{ currency?: string | null; amount?: number | string | null }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || "UNKNOWN";
    totals.set(currency, (totals.get(currency) ?? 0) + Number(row.amount ?? 0));
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }));
}
export function moneyByCurrency<T extends { currency?: string | null }>(
  rows: T[],
  value: (row: T) => number,
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency || "UNKNOWN";
    totals.set(currency, (totals.get(currency) ?? 0) + value(row));
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }));
}
