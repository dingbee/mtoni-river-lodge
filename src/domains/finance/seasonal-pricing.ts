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
