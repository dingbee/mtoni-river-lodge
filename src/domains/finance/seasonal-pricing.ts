import { z } from "zod";

export const SEASON_TYPES = ["low","shoulder","high","peak","festive","event","custom"] as const;

export const seasonalRateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).default(""),
  season_type: z.enum(SEASON_TYPES),
  start_date: z.string().date(),
  end_date: z.string().date(),
  room_type_ids: z.array(z.string().uuid()).min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  nightly_rate: z.number().finite().positive(),
  priority: z.number().int().min(0).max(10000),
  active: z.boolean().default(true),
}).refine((season) => season.end_date >= season.start_date, {
  message: "Season end date must be on or after its start date.",
  path: ["end_date"],
});

export const seasonalRatesSchema = z.record(
  z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),
  seasonalRateSchema,
).superRefine((seasons, ctx) => {
  const active = Object.entries(seasons).filter(([, season]) => season.active);
  for (let i = 0; i < active.length; i += 1) {
    const [leftKey, left] = active[i];
    for (let j = i + 1; j < active.length; j += 1) {
      const [rightKey, right] = active[j];
      const datesOverlap = left.start_date <= right.end_date && right.start_date <= left.end_date;
      const roomTypesOverlap = left.room_type_ids.some((id) => right.room_type_ids.includes(id));
      if (datesOverlap && roomTypesOverlap && left.priority === right.priority) {
        ctx.addIssue({
          code: "custom",
          path: [rightKey],
          message: `Active seasons "${leftKey}" and "${rightKey}" overlap for at least one room type and must have different priorities.`,
        });
      }
    }
  }
});

export type SeasonalRate = z.infer<typeof seasonalRateSchema>;
export type SeasonalRates = z.infer<typeof seasonalRatesSchema>;

export function validateSeasonalRateCurrency(seasons: SeasonalRates, propertyCurrency: string) {
  const currency = propertyCurrency.toUpperCase();
  for (const [key, season] of Object.entries(seasons)) {
    if (season.currency !== currency) {
      throw new Error(`Season "${key}" currency must match the property currency (${currency}).`);
    }
  }
}

export function validateSeasonalRateRoomTypes(seasons: SeasonalRates, configuredRoomTypeIds: Set<string>) {
  for (const [key, season] of Object.entries(seasons)) {
    for (const roomTypeId of season.room_type_ids) {
      if (!configuredRoomTypeIds.has(roomTypeId)) {
        throw new Error(`Season "${key}" references a room type outside the active property catalogue.`);
      }
    }
  }
}

export function mergeSeasonalRateRecords(
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

/**
 * Resolve an applicable season for a property-local calendar date.
 * Date bounds are inclusive. A larger priority value takes precedence.
 * Equal-priority overlaps are rejected by seasonalRatesSchema before resolution.
 */
export function resolveSeasonalRateForDate(
  seasons: SeasonalRates,
  roomTypeId: string,
  propertyLocalDate: string,
): SeasonalRate | null {
  const matches = Object.values(seasons).filter((season) =>
    season.active &&
    season.room_type_ids.includes(roomTypeId) &&
    season.start_date <= propertyLocalDate &&
    season.end_date >= propertyLocalDate
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.priority - a.priority)[0] ?? null;
}
