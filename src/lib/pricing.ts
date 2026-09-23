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
  const adults = Math.floor(o.adults);
  if (!Number.isFinite(adults) || adults < 1) throw new Error("At least one adult is required");
  const below6 = Math.max(0, Math.floor(o.childrenBelow6 ?? 0));
  const plus7 = Math.max(0, Math.floor(o.children7Plus ?? 0));
  const total = adults + below6 + plus7;
  if (total > cfg.maxGuests) throw new Error("Room allows up to " + cfg.maxGuests + " occupants");
  const paid = adults + plus7;
  const extra = Math.max(0, paid - cfg.includedGuests);
  const extraCharges = extra * cfg.extraGuestFee;
  const n = Math.max(1, Math.floor(nights));
  const nightly = cfg.basePrice + extraCharges;
  return { basePrice: cfg.basePrice, paidOccupants: paid, totalOccupants: total, extraOccupants: extra, extraOccupantFee: cfg.extraGuestFee, extraCharges, nightlyRate: nightly, nights: n, grandTotal: nightly * n, currency: cfg.currency };
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
