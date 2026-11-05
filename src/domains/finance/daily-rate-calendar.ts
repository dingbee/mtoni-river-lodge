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
