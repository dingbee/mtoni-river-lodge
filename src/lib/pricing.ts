import { calculatePricingQuote } from "@/domains/finance/pricing-engine";

export type RoomPricingConfig = {
  basePrice: number;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: number;
  currency: string;
};

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
  currency: string;
}

export function buildPriceBreakdownFromConfig(cfg: RoomPricingConfig, o: Occupancy, nights = 1): PriceBreakdown {
  const n = Math.max(1, Math.floor(nights));
  const checkIn = "2000-01-01";
  const checkOut = new Date(Date.UTC(2000, 0, 1 + n)).toISOString().slice(0, 10);
  const quote = calculatePricingQuote({
    room: {
      id: "legacy-room",
      propertyId: "legacy-property",
      basePrice: cfg.basePrice,
      currency: cfg.currency,
      includedGuests: cfg.includedGuests,
      extraGuestFee: cfg.extraGuestFee,
      capacityAdults: cfg.maxGuests,
      capacityChildren: cfg.maxGuests,
      maxOccupancy: cfg.maxGuests,
    },
    checkIn,
    checkOut,
    occupancy: o,
    inventory: [],
    rules: [],
  });
  const totalOccupants = quote.occupants;
  const paidOccupants = quote.paidOccupants;
  const extraOccupants = Math.max(0, paidOccupants - cfg.includedGuests);
  return {
    basePrice: cfg.basePrice,
    paidOccupants,
    totalOccupants,
    extraOccupants,
    extraOccupantFee: cfg.extraGuestFee,
    extraCharges: extraOccupants * cfg.extraGuestFee,
    nightlyRate: quote.nightly[0].nightlyRate,
    nights: quote.nights,
    grandTotal: quote.subtotal,
    currency: quote.currency,
  };
}
export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// Compatibility guards for legacy callers. Room pricing is now database-driven.
export function getRoomPricing(_roomType: string): RoomPricingConfig {
  throw new Error("Room pricing is database-driven; load the room configuration first.");
}
export function getBasePriceUsd(_roomType: string): number {
  throw new Error("Room pricing is database-driven; load the room configuration first.");
}
export function getBasePriceLabel(_roomType: string): string {
  throw new Error("Room pricing is database-driven; load the room configuration first.");
}
export function calculateNightlyRate(_roomType: string, _guests: number | Occupancy): number {
  throw new Error("Room pricing is database-driven; load the room configuration first.");
}
export function calculateBookingTotal(_roomType: string, _guests: number | Occupancy, _nights = 1): number {
  throw new Error("Room pricing is database-driven; load the room configuration first.");
}
