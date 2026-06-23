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

/** Per-night rate for the given room + guest count. */
export function calculateNightlyRate(roomType: string, guestCount: number): number {
  const cfg = getRoomPricing(roomType);
  const guests = Math.max(1, Math.min(Math.floor(guestCount), cfg.maxGuests));
  const extraGuests = Math.max(0, guests - cfg.includedGuests);
  return cfg.basePrice + extraGuests * cfg.extraGuestFee;
}

/**
 * Total room charge for a stay. `nights` defaults to 1 so the function can
 * also answer the canonical per-night question used in tests.
 */
export function calculateBookingTotal(
  roomType: string,
  guestCount: number,
  nights = 1,
): number {
  const n = Math.max(1, Math.floor(nights));
  return calculateNightlyRate(roomType, guestCount) * n;
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