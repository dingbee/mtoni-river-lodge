/* eslint-disable @typescript-eslint/no-explicit-any -- property RPCs are not in the generated types */
import { assertCurrencyCode, totalsByCurrency } from "@/lib/money";

export type ActivePropertyCurrency = { propertyId: string; currency: string };

/**
 * Resolves the caller's server-side active property and its authoritative ISO currency.
 * Reporting is scoped to this property; no default currency is ever assumed.
 */
export async function resolveActivePropertyCurrency(supabase: any, userId: string): Promise<ActivePropertyCurrency> {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("Active property context is required.");
  const { data: property, error: propertyError } = await supabase
    .from("staynas_properties")
    .select("id,currency")
    .eq("id", propertyId)
    .single();
  if (propertyError || !property) throw new Error("Active property could not be loaded.");
  return { propertyId, currency: assertCurrencyCode(property.currency, "Property currency") };
}

/**
 * Splits rows into those denominated in the reporting currency and a per-currency
 * summary of everything else. Amounts in other currencies are reported, never merged.
 */
export function partitionByCurrency<T extends { currency?: string | null }>(
  rows: T[],
  currency: string,
  amountOf: (row: T) => number | string | null | undefined,
) {
  const inCurrency = rows.filter((row) => String(row.currency ?? "").toUpperCase() === currency);
  const others = rows.filter((row) => String(row.currency ?? "").toUpperCase() !== currency);
  return {
    inCurrency,
    otherCurrencies: totalsByCurrency(others, (row) => row.currency, (row) => amountOf(row) ?? 0),
  };
}

export function sumAmounts<T>(rows: T[], currency: string, amountOf: (row: T) => number | string | null | undefined): number {
  const [total] = totalsByCurrency(rows, () => currency, (row) => amountOf(row) ?? 0);
  return total?.amount ?? 0;
}
