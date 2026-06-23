/**
 * Centralized booking pricing service — SINGLE SOURCE OF TRUTH.
 *
 * All room-rate math (frontend display, booking summary, checkout amount,
 * Pesapal amount derivation) MUST go through this module. Backend uses the
 * same configuration mirrored in the `rooms` table and enforced by the
 * `create_booking` Postgres function.
 *
 * Per-night formula:
 *   extraGuests = max(0, guestCount - includedGuests)
 *   nightlyRate = basePrice + extraGuests * extraGuestFee
 *
 * Booking total:
 *   total = nightlyRate * nights
 */

export type RoomType = "standard-river" | "riverfront-deluxe" | "family-room";

export interface RoomPricingConfig {
  basePrice: number;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: number;
  currency: "USD";
}

export const ROOM_PRICING: Record<RoomType, RoomPricingConfig> = {
  "standard-river": {
    basePrice: 260,
    includedGuests: 2,
    maxGuests: 3,
    extraGuestFee: 30,
    currency: "USD",
  },
  "riverfront-deluxe": {
    basePrice: 310,
    includedGuests: 2,
    maxGuests: 3,
    extraGuestFee: 30,
    currency: "USD",
  },
  "family-room": {
    basePrice: 360,
    includedGuests: 5,
    maxGuests: 5,
    extraGuestFee: 0,
    currency: "USD",
  },
};

export function getRoomPricing(roomType: string): RoomPricingConfig {
  const cfg = ROOM_PRICING[roomType as RoomType];
  if (!cfg) throw new Error(`Unknown room type: ${roomType}`);
  return cfg;
}

/**
 * Occupancy breakdown:
 *  - adults: paid occupants (>=1)
 *  - childrenBelow6: free, count toward capacity only
 *  - children7Plus: paid occupants
 * Paid occupants = adults + children7Plus
 * Total occupants (capacity check) = adults + childrenBelow6 + children7Plus
 */
export interface Occupancy {
  adults: number;
  childrenBelow6?: number;
  children7Plus?: number;
}

export interface PriceBreakdown {
  basePrice: number;
  paidOccupants: number;
  totalOccupants: number;
  extraOccupants: number;
  extraOccupantFee: number;
  extraCharges: number;
  nightlyRate: number;
  nights: number;
  grandTotal: number;
  currency: "USD";
}

export function validateOccupancy(roomType: string, o: Occupancy): void {
  const cfg = getRoomPricing(roomType);
  const adults = Math.floor(o.adults);
  if (!Number.isFinite(adults) || adults < 1) throw new Error("At least one adult is required");
  const below6 = Math.max(0, Math.floor(o.childrenBelow6 ?? 0));
  const plus7 = Math.max(0, Math.floor(o.children7Plus ?? 0));
  const total = adults + below6 + plus7;
  if (total > cfg.maxGuests) {
    throw new Error(`Room allows up to ${cfg.maxGuests} occupants`);
  }
}

export function buildPriceBreakdown(
  roomType: string,
  o: Occupancy,
  nights = 1,
): PriceBreakdown {
  const cfg = getRoomPricing(roomType);
  validateOccupancy(roomType, o);
  const adults = Math.floor(o.adults);
  const below6 = Math.max(0, Math.floor(o.childrenBelow6 ?? 0));
  const plus7 = Math.max(0, Math.floor(o.children7Plus ?? 0));
  const paidOccupants = adults + plus7;
  const totalOccupants = adults + below6 + plus7;
  const extraOccupants = Math.max(0, paidOccupants - cfg.includedGuests);
  const extraCharges = extraOccupants * cfg.extraGuestFee;
  const nightlyRate = cfg.basePrice + extraCharges;
  const n = Math.max(1, Math.floor(nights));
  return {
    basePrice: cfg.basePrice,
    paidOccupants,
    totalOccupants,
    extraOccupants,
    extraOccupantFee: cfg.extraGuestFee,
    extraCharges,
    nightlyRate,
    nights: n,
    grandTotal: nightlyRate * n,
    currency: cfg.currency,
  };
}

/** Per-night rate. Accepts an Occupancy object or a legacy guest-count number. */
export function calculateNightlyRate(roomType: string, guests: number | Occupancy): number {
  const o: Occupancy = typeof guests === "number"
    ? { adults: Math.max(1, Math.floor(guests)) }
    : guests;
  return buildPriceBreakdown(roomType, o, 1).nightlyRate;
}

/** Total room charge. Accepts an Occupancy object or a legacy guest-count number. */
export function calculateBookingTotal(
  roomType: string,
  guests: number | Occupancy,
  nights = 1,
): number {
  const o: Occupancy = typeof guests === "number"
    ? { adults: Math.max(1, Math.floor(guests)) }
    : guests;
  return buildPriceBreakdown(roomType, o, nights).grandTotal;
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Base "from" advertised price (for marketing/landing pages). */
export function getBasePriceUsd(roomType: string): number {
  return getRoomPricing(roomType).basePrice;
}

/** Formatted "from" price, e.g. "$260". */
export function getBasePriceLabel(roomType: string): string {
  return formatUsd(getBasePriceUsd(roomType));
}