export type PricingAdjustmentKind = "percent" | "fixed" | "override";
export type PricingRuleType =
  | "seasonal"
  | "weekend"
  | "promo"
  | "corporate"
  | "package"
  | "child"
  | "extra_guest"
  | "min_stay"
  | "blackout";

export interface PricingRoom {
  id: string;
  propertyId: string;
  basePrice: number;
  currency: string;
  includedGuests: number;
  extraGuestFee: number;
  capacityAdults: number;
  capacityChildren: number;
  maxOccupancy: number;
}

export interface PricingOccupancy {
  adults: number;
  childrenBelow6?: number;
  children7Plus?: number;
}

export interface DailyInventoryPrice {
  date: string;
  priceOverride?: number | null;
}

export interface PropertyPricingRule {
  id: string;
  propertyId: string;
  roomId?: string | null;
  ruleType: PricingRuleType;
  startsOn?: string | null;
  endsOn?: string | null;
  weekdays?: number[] | null;
  adjustmentKind?: PricingAdjustmentKind | null;
  adjustmentValue?: number | null;
  minStayNights?: number | null;
  priority: number;
  active: boolean;
}

export interface NightlyPrice {
  date: string;
  baseRate: number;
  occupancySurcharge: number;
  adjustment: number;
  nightlyRate: number;
  currency: string;
  appliedRuleId: string | null;
  appliedRuleType: PricingRuleType | null;
}

export interface PricingQuote {
  propertyId: string;
  roomId: string;
  currency: string;
  nights: number;
  occupants: number;
  paidOccupants: number;
  minimumStay: number;
  subtotal: number;
  nightly: NightlyPrice[];
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validMoney(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(label + " must be a finite non-negative amount");
  }
  return value;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateMatches(rule: PropertyPricingRule, date: string): boolean {
  if (!rule.active) return false;
  if (rule.startsOn && date < rule.startsOn) return false;
  if (rule.endsOn && date > rule.endsOn) return false;
  if (rule.weekdays?.length) {
    const weekday = new Date(date + "T00:00:00.000Z").getUTCDay();
    if (!rule.weekdays.includes(weekday)) return false;
  }
  return true;
}

function ruleAppliesToRoom(rule: PropertyPricingRule, room: PricingRoom): boolean {
  return rule.propertyId === room.propertyId && (!rule.roomId || rule.roomId === room.id);
}

function compareRules(a: PropertyPricingRule, b: PropertyPricingRule): number {
  const specificity = Number(Boolean(b.roomId)) - Number(Boolean(a.roomId));
  return specificity || a.priority - b.priority || a.id.localeCompare(b.id);
}

/**
 * Deterministic quote calculator. Inventory overrides establish the daily
 * base; one eligible adjustment rule wins per night by room specificity,
 * priority, then stable rule ID. Blackouts and minimum-stay rules are
 * constraints, not monetary adjustments.
 */
export function calculatePricingQuote(input: {
  room: PricingRoom;
  checkIn: string;
  checkOut: string;
  occupancy: PricingOccupancy;
  inventory: DailyInventoryPrice[];
  rules: PropertyPricingRule[];
}): PricingQuote {
  const { room, checkIn, checkOut, occupancy } = input;
  if (!isValidDate(checkIn) || !isValidDate(checkOut) || checkOut <= checkIn) {
    throw new Error("A valid check-in and later check-out date are required");
  }
  if (!room.id || !room.propertyId) throw new Error("Property and room are required");
  if (!/^[A-Z]{3}$/.test(room.currency)) throw new Error("A valid property currency is required");
  validMoney(room.basePrice, "Base price");
  validMoney(room.extraGuestFee, "Extra guest fee");
  if (!Number.isInteger(room.includedGuests) || room.includedGuests < 1) throw new Error("Included guests must be a positive integer");

  const adults = occupancy.adults;
  const below6 = occupancy.childrenBelow6 ?? 0;
  const plus7 = occupancy.children7Plus ?? 0;
  if (![adults, below6, plus7].every((n) => Number.isInteger(n) && n >= 0) || adults < 1) {
    throw new Error("Occupancy must contain at least one adult and non-negative whole guest counts");
  }
  if (adults > room.capacityAdults || below6 + plus7 > room.capacityChildren) {
    throw new Error("Room adult or child capacity exceeded");
  }
  const occupants = adults + below6 + plus7;
  if (occupants > room.maxOccupancy) throw new Error("Room maximum occupancy exceeded");
  const paidOccupants = adults + plus7;
  const extraOccupants = Math.max(0, paidOccupants - room.includedGuests);
  const occupancySurcharge = money(extraOccupants * room.extraGuestFee);
  const nights = Math.round((Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z")) / 86400000);
  if (!Number.isSafeInteger(nights) || nights < 1) throw new Error("Stay duration is invalid");

  const roomRules = input.rules.filter((rule) => ruleAppliesToRoom(rule, room));
  const applicableStayRules = roomRules.filter((rule) => rule.ruleType === "min_stay" && dateMatches(rule, checkIn));
  const minimumStay = applicableStayRules.reduce((max, rule) => Math.max(max, rule.minStayNights ?? 0), 1);
  if (nights < minimumStay) throw new Error("Minimum stay is " + minimumStay + " nights");
  
  const inventoryByDate = new Map(input.inventory.map((row) => [row.date, row]));
  const nightly: NightlyPrice[] = [];
  let subtotal = 0;
  for (let offset = 0; offset < nights; offset += 1) {
    const date = new Date(Date.parse(checkIn + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
    const matchingRules = roomRules.filter((rule) => dateMatches(rule, date));
    if (matchingRules.some((rule) => rule.ruleType === "blackout")) {
      throw new Error("Pricing blackout applies on " + date);
    }
    const dailyOverride = inventoryByDate.get(date)?.priceOverride;
    const baseRate = dailyOverride == null ? room.basePrice : validMoney(dailyOverride, "Daily inventory override");
    const preAdjustment = money(baseRate + occupancySurcharge);
    const adjustmentRule = matchingRules
      .filter((rule) => rule.adjustmentKind && rule.adjustmentValue != null)
      .sort(compareRules)[0];
    let nightlyRate = preAdjustment;
    let adjustment = 0;
    if (adjustmentRule) {
      const value = Number(adjustmentRule.adjustmentValue);
      if (!Number.isFinite(value)) throw new Error("Pricing rule adjustment must be finite");
      if (adjustmentRule.adjustmentKind === "percent") {
        adjustment = money(preAdjustment * value / 100);
        nightlyRate = money(preAdjustment + adjustment);
      } else if (adjustmentRule.adjustmentKind === "fixed") {
        adjustment = money(value);
        nightlyRate = money(preAdjustment + adjustment);
      } else {
        nightlyRate = validMoney(value, "Override rate");
        adjustment = money(nightlyRate - preAdjustment);
      }
    }
    if (nightlyRate < 0) throw new Error("Pricing rules cannot produce a negative nightly rate");
    subtotal = money(subtotal + nightlyRate);
    nightly.push({
      date,
      baseRate,
      occupancySurcharge,
      adjustment,
      nightlyRate,
      currency: room.currency,
      appliedRuleId: adjustmentRule?.id ?? null,
      appliedRuleType: adjustmentRule?.ruleType ?? null,
    });
  }

  return {
    propertyId: room.propertyId,
    roomId: room.id,
    currency: room.currency,
    nights,
    occupants,
    paidOccupants,
    minimumStay,
    subtotal,
    nightly,
  };
}
