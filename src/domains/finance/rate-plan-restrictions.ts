import { z } from "zod";

const restrictionBase = {
  start_date: z.string().date(),
  end_date: z.string().date(),
  room_type_ids: z.array(z.string().uuid()).min(1).max(100).refine(
    (ids) => new Set(ids).size === ids.length,
    "Room types must be unique.",
  ),
  active: z.boolean(),
  reason: z.string().trim().min(5).max(500),
};

export const restrictionRuleSchema = z.discriminatedUnion("type", [
  z.object({ ...restrictionBase, type: z.literal("min_los"), value: z.number().int().min(1).max(365) }),
  z.object({ ...restrictionBase, type: z.literal("max_los"), value: z.number().int().min(1).max(365) }),
  z.object({ ...restrictionBase, type: z.literal("advance_booking_min_hours"), value: z.number().int().min(0).max(87600) }),
  z.object({ ...restrictionBase, type: z.literal("advance_booking_max_days"), value: z.number().int().min(0).max(3650) }),
  z.object({ ...restrictionBase, type: z.literal("closed_to_arrival") }),
  z.object({ ...restrictionBase, type: z.literal("closed_to_departure") }),
  z.object({ ...restrictionBase, type: z.literal("stop_sell") }),
]).superRefine((rule, context) => {
  if (rule.end_date < rule.start_date) {
    context.addIssue({ code: "custom", path: ["end_date"], message: "Restriction end date must be on or after its start date." });
  }
});

export const restrictionRulesSchema = z.record(
  z.string().regex(/^[A-Za-z0-9_-]{2,80}$/),
  restrictionRuleSchema.nullable(),
);

export type RestrictionRule = z.infer<typeof restrictionRuleSchema>;
export type RestrictionRules = Record<string, RestrictionRule>;

export type RestrictionEvaluationInput = {
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  bookedAt?: string;
  arrivalAt?: string;
};

export type RestrictionEvaluation = {
  sellable: boolean;
  reasons: string[];
  stayNights: number;
  matchedRuleKeys: string[];
};

function dateOrdinal(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`) / 86_400_000;
}

export function mergeRestrictionRecords(
  inherited: Record<string, unknown>,
  own: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...inherited };
  for (const [key, value] of Object.entries(own)) {
    if (value === null) delete result[key];
    else result[key] = value;
  }
  return result;
}

export function validateRestrictionRoomTypes(
  rules: Record<string, RestrictionRule>,
  allowedRoomTypeIds: Set<string>,
): void {
  for (const [key, rule] of Object.entries(rules)) {
    const invalid = rule.room_type_ids.filter((id) => !allowedRoomTypeIds.has(id));
    if (invalid.length) {
      throw new Error(`Restriction ${key} references room types outside this property's catalogue.`);
    }
  }
}

export function evaluateStayNasRestrictions(
  rules: Record<string, RestrictionRule>,
  input: RestrictionEvaluationInput,
): RestrictionEvaluation {
  const reasons: string[] = [];
  const matchedRuleKeys: string[] = [];
  const arrival = dateOrdinal(input.arrivalDate);
  const departure = dateOrdinal(input.departureDate);
  const stayNights = departure - arrival;

  if (!Number.isFinite(arrival) || !Number.isFinite(departure) || stayNights <= 0) {
    return {
      sellable: false,
      reasons: ["Invalid stay dates: departure must be after arrival."],
      stayNights: Math.max(0, stayNights || 0),
      matchedRuleKeys: [],
    };
  }

  const leadHours = input.bookedAt && input.arrivalAt
    ? (Date.parse(input.arrivalAt) - Date.parse(input.bookedAt)) / 3_600_000
    : null;

  const activeRules = Object.entries(rules).filter(([, rule]) =>
    rule.active && rule.room_type_ids.includes(input.roomTypeId),
  );

  for (const [key, rule] of activeRules) {
    const start = dateOrdinal(rule.start_date);
    const end = dateOrdinal(rule.end_date);
    const arrivalInPeriod = arrival >= start && arrival <= end;
    const departureInPeriod = departure >= start && departure <= end;
    const stayOverlapsPeriod = arrival < end + 1 && departure > start;

    let matched = false;
    let reason: string | null = null;

    switch (rule.type) {
      case "min_los":
        matched = arrivalInPeriod;
        if (matched && stayNights < rule.value) reason = `Minimum stay is ${rule.value} nights: ${rule.reason}`;
        break;
      case "max_los":
        matched = arrivalInPeriod;
        if (matched && stayNights > rule.value) reason = `Maximum stay is ${rule.value} nights: ${rule.reason}`;
        break;
      case "closed_to_arrival":
        matched = arrivalInPeriod;
        if (matched) reason = `Closed to arrival: ${rule.reason}`;
        break;
      case "closed_to_departure":
        matched = departureInPeriod;
        if (matched) reason = `Closed to departure: ${rule.reason}`;
        break;
      case "stop_sell":
        matched = stayOverlapsPeriod;
        if (matched) reason = `Stop-sell applies to one or more nights in this stay: ${rule.reason}`;
        break;
      case "advance_booking_min_hours":
        matched = arrivalInPeriod && leadHours !== null;
        if (matched && leadHours !== null && leadHours < rule.value) {
          reason = `Booking must be made at least ${rule.value} hours before arrival: ${rule.reason}`;
        }
        break;
      case "advance_booking_max_days":
        matched = arrivalInPeriod && leadHours !== null;
        if (matched && leadHours !== null && leadHours > rule.value * 24) {
          reason = `Booking cannot be made more than ${rule.value} days before arrival: ${rule.reason}`;
        }
        break;
    }

    if (matched) matchedRuleKeys.push(key);
    if (reason) reasons.push(reason);
  }

  const minLos = activeRules
    .filter(([, rule]) => rule.type === "min_los" && arrival >= dateOrdinal(rule.start_date) && arrival <= dateOrdinal(rule.end_date))
    .reduce((value, [, rule]) => Math.max(value, rule.type === "min_los" ? rule.value : 0), 0);
  const maxLos = activeRules
    .filter(([, rule]) => rule.type === "max_los" && arrival >= dateOrdinal(rule.start_date) && arrival <= dateOrdinal(rule.end_date))
    .reduce((value, [, rule]) => Math.min(value, rule.type === "max_los" ? rule.value : Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  if (minLos > maxLos) reasons.push(`Conflicting stay-length restrictions: minimum ${minLos} nights exceeds maximum ${maxLos} nights.`);

  return { sellable: reasons.length === 0, reasons, stayNights, matchedRuleKeys };
}
