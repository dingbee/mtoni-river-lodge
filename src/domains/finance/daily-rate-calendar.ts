import { z } from "zod";

export const dailyRateSchema = z.object({
  nightly_rate: z.number().finite().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  active: z.boolean().default(true),
});

export const dailyRatesSchema = z.record(
  z.string().date(),
  z.record(z.string().uuid(), dailyRateSchema),
);

export type DailyRate = z.infer<typeof dailyRateSchema>;
export type DailyRates = z.infer<typeof dailyRatesSchema>;

export function mergeDailyRateRecords(
  parent: Record<string, unknown>,
  child: Record<string, unknown>,
): Record<string, unknown> {
  const merge = (base: unknown, overlay: unknown): unknown => {
    if (overlay === null || typeof overlay !== "object" || Array.isArray(overlay)) return overlay;
    const result: Record<string, unknown> =
      base !== null && typeof base === "object" && !Array.isArray(base)
        ? { ...(base as Record<string, unknown>) }
        : {};
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      result[key] = value !== null && typeof value === "object" && !Array.isArray(value)
        ? merge(result[key], value)
        : value;
    }
    return result;
  };
  return merge(parent, child) as Record<string, unknown>;
}

export function validateDailyRateCurrency(rates: DailyRates, propertyCurrency: string) {
  const currency = propertyCurrency.toUpperCase();
  for (const [date, roomRates] of Object.entries(rates)) {
    for (const [roomTypeId, rate] of Object.entries(roomRates)) {
      if (rate.currency !== currency) {
        throw new Error(`Daily rate for ${roomTypeId} on ${date} must match property currency (${currency}).`);
      }
    }
  }
}

export function validateDailyRateRoomTypes(rates: DailyRates, configuredRoomTypeIds: Set<string>) {
  for (const [date, roomRates] of Object.entries(rates)) {
    for (const roomTypeId of Object.keys(roomRates)) {
      if (!configuredRoomTypeIds.has(roomTypeId)) {
        throw new Error(`Daily rate on ${date} references a room type outside the active property catalogue.`);
      }
    }
  }
}

/** Exact-date override for one room type. Null means no daily override applies. */
export function resolveDailyRate(
  rates: DailyRates,
  roomTypeId: string,
  propertyLocalDate: string,
): DailyRate | null {
  const rate = rates[propertyLocalDate]?.[roomTypeId];
  return rate?.active ? rate : null;
}

export type DailyRateBulkTarget = { date: string; roomTypeId: string };
export type DailyRateBulkMode = "set" | "amount" | "percent";

export function applyDailyRateBulkChange(
  rates: Record<string, Record<string, Record<string, unknown> | null>>,
  targets: DailyRateBulkTarget[],
  mode: DailyRateBulkMode,
  value: number,
): Record<string, Record<string, Record<string, unknown> | null>> {
  if (!targets.length) throw new Error("Select at least one existing daily override.");
  if (!Number.isFinite(value)) throw new Error("Bulk rate value must be a finite number.");
  if (mode !== "set" && mode === "percent" && value <= -100) {
    throw new Error("Percentage reduction must be greater than -100%.");
  }
  const next = { ...rates };
  for (const target of targets) {
    const dateRates = next[target.date];
    const current = dateRates?.[target.roomTypeId];
    if (!current || typeof current !== "object") {
      throw new Error("Selected daily override no longer exists for " + target.date + ".");
    }
    const oldRate = Number(current.nightly_rate);
    const newRate = mode === "set"
      ? value
      : mode === "amount"
        ? oldRate + value
        : oldRate * (1 + value / 100);
    if (!Number.isFinite(newRate) || newRate <= 0) {
      throw new Error("Bulk change would create a non-positive nightly rate for " + target.date + ".");
    }
    next[target.date] = {
      ...dateRates,
      [target.roomTypeId]: { ...current, nightly_rate: Math.round(newRate * 100) / 100 },
    };
  }
  return next;
}

export function setDailyRateBulkActive(
  rates: Record<string, Record<string, Record<string, unknown> | null>>,
  targets: DailyRateBulkTarget[],
  active: boolean,
): Record<string, Record<string, Record<string, unknown> | null>> {
  const next = { ...rates };
  for (const target of targets) {
    const dateRates = next[target.date];
    const current = dateRates?.[target.roomTypeId];
    if (!current || typeof current !== "object") continue;
    next[target.date] = { ...dateRates, [target.roomTypeId]: { ...current, active } };
  }
  return next;
}

export function clearDailyRateBulkOverrides(
  rates: Record<string, Record<string, Record<string, unknown> | null>>,
  targets: DailyRateBulkTarget[],
): Record<string, Record<string, Record<string, unknown> | null>> {
  const next = { ...rates };
  for (const target of targets) {
    next[target.date] = { ...(next[target.date] ?? {}), [target.roomTypeId]: null };
  }
  return next;
}
