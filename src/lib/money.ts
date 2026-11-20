// Canonical StayNas money primitives.
//
// - The ISO 4217 code is the only currency identifier; symbols are presentation.
// - Precision follows the currency's ISO minor units (JPY 0, USD/TZS 2, KWD 3).
// - Arithmetic is exact integer arithmetic on minor units (BigInt); binary floating
//   point is never used to add, subtract or compare money.
// - Amounts in different currencies are never combined; there are no implicit
//   conversions and no default currency.

const ISO_CODE = /^[A-Z]{3}$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export type MoneyAmount = number | string | bigint;

export interface Money {
  /** Amount as an exact decimal string in the currency's minor-unit precision. */
  amount: string;
  /** ISO 4217 alphabetic code. */
  currency: string;
  /** Number of ISO minor units for the currency. */
  minorUnits: number;
}

const minorUnitCache = new Map<string, number>();

export function isIsoCurrencyCode(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_CODE.test(value)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value });
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    return supported ? supported("currency").includes(value) : true;
  } catch {
    return false;
  }
}

export function assertCurrencyCode(value: unknown, context = "Currency"): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!isIsoCurrencyCode(code)) {
    throw new MoneyError(`${context} must be a valid ISO 4217 code`);
  }
  return code;
}

/** ISO 4217 minor units for a currency (e.g. TZS 2, JPY 0, KWD 3). */
export function currencyMinorUnits(currency: string): number {
  const code = assertCurrencyCode(currency);
  const cached = minorUnitCache.get(code);
  if (cached !== undefined) return cached;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  minorUnitCache.set(code, digits);
  return digits;
}

function decimalString(amount: MoneyAmount): string {
  if (typeof amount === "bigint") return amount.toString();
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) throw new MoneyError("Monetary amount must be finite");
    // Numbers arrive from JSON/PostgREST numeric columns; toString yields the shortest
    // round-trip decimal, which is exact for the numeric(…,2) values the database stores.
    const text = String(amount);
    if (/e/i.test(text)) {
      return amount.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
    }
    return text;
  }
  const text = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new MoneyError(`Monetary amount "${amount}" is not a decimal number`);
  return text;
}

/**
 * Converts an amount to an exact integer count of minor units. Amounts with more
 * precision than the currency allows are rejected rather than silently rounded.
 */
export function toMinorUnits(amount: MoneyAmount, currency: string): bigint {
  const digits = currencyMinorUnits(currency);
  const text = decimalString(amount);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const significantFraction = fraction.replace(/0+$/, "");
  if (significantFraction.length > digits) {
    throw new MoneyError(`${text} ${currency} has more precision than the currency's ${digits} minor unit(s)`);
  }
  const minor = BigInt(whole + fraction.padEnd(digits, "0").slice(0, digits));
  return negative ? -minor : minor;
}

export function fromMinorUnits(minor: bigint, currency: string): Money {
  const digits = currencyMinorUnits(currency);
  const negative = minor < 0n;
  const abs = (negative ? -minor : minor).toString().padStart(digits + 1, "0");
  const whole = digits ? abs.slice(0, -digits) : abs;
  const fraction = digits ? abs.slice(-digits) : "";
  return {
    amount: `${negative ? "-" : ""}${whole}${digits ? "." + fraction : ""}`,
    currency: assertCurrencyCode(currency),
    minorUnits: digits,
  };
}

export function money(amount: MoneyAmount, currency: string): Money {
  const code = assertCurrencyCode(currency);
  return fromMinorUnits(toMinorUnits(amount, code), code);
}

export function moneyToNumber(value: Money): number {
  return Number(value.amount);
}

/** Adds amounts of a single currency exactly. Mixed currencies are rejected. */
export function addMoney(values: Array<{ amount: MoneyAmount; currency: string }>, currency: string): Money {
  const code = assertCurrencyCode(currency);
  let total = 0n;
  for (const value of values) {
    if (assertCurrencyCode(value.currency) !== code) {
      throw new MoneyError(`Cannot combine ${value.currency} with ${code} without an explicit recorded conversion`);
    }
    total += toMinorUnits(value.amount, code);
  }
  return fromMinorUnits(total, code);
}

export const UNCLASSIFIED_CURRENCY = "UNKNOWN";

/**
 * Totals per currency with exact minor-unit arithmetic. Rows without a valid ISO
 * currency are kept in an explicit UNKNOWN bucket (never assigned a guessed currency).
 */
export function totalsByCurrency<T>(
  rows: T[],
  currencyOf: (row: T) => string | null | undefined,
  amountOf: (row: T) => MoneyAmount | null | undefined,
): Array<{ currency: string; amount: number }> {
  // Unclassified amounts have no currency scale, so they are summed at 6-decimal
  // fixed precision and kept visibly separate.
  const UNKNOWN_SCALE = 6;
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const raw = currencyOf(row);
    const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    const amount = amountOf(row) ?? 0;
    if (isIsoCurrencyCode(code)) {
      totals.set(code, (totals.get(code) ?? 0n) + toMinorUnits(amount, code));
    } else {
      const [whole, fraction = ""] = decimalString(amount).replace("-", "").split(".");
      const scaled = BigInt(whole + fraction.padEnd(UNKNOWN_SCALE, "0").slice(0, UNKNOWN_SCALE));
      const signed = decimalString(amount).startsWith("-") ? -scaled : scaled;
      totals.set(UNCLASSIFIED_CURRENCY, (totals.get(UNCLASSIFIED_CURRENCY) ?? 0n) + signed);
    }
  }
  return Array.from(totals, ([currency, minor]) => ({
    currency,
    amount: currency === UNCLASSIFIED_CURRENCY
      ? Number(minor) / 10 ** UNKNOWN_SCALE
      : moneyToNumber(fromMinorUnits(minor, currency)),
  }));
}

export interface FormatMoneyOptions {
  locale?: string;
  /** "code" renders "TZS 125,000"; "symbol" renders the locale symbol. Default "code". */
  display?: "code" | "symbol" | "narrowSymbol";
}

/**
 * Formats an amount with its ISO currency. Whole amounts drop the fraction
 * ("TZS 125,000"); other amounts show the currency's full minor-unit precision
 * ("USD 125.50"). Amounts are never rounded to whole units for display.
 */
export function formatMoney(amount: MoneyAmount | null | undefined, currency: string | null | undefined, options: FormatMoneyOptions = {}): string {
  const code = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (amount === null || amount === undefined || amount === "" || !isIsoCurrencyCode(code)) return "—";
  const value = money(amount, code);
  const digits = value.minorUnits;
  const whole = digits === 0 || /\.0+$/.test(value.amount);
  return new Intl.NumberFormat(options.locale ?? "en-US", {
    style: "currency",
    currency: code,
    currencyDisplay: options.display ?? "code",
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(Number(value.amount));
}
