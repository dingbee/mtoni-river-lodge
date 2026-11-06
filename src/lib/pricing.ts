// Currency formatting only. All accommodation amounts are supplied by the
// database-authoritative StayNas pricing and quote services.
export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// Compatibility guards for retired client-side pricing callers.
export function getRoomPricing(_roomType: string): never {
  throw new Error("Room pricing is database-driven; request a server pricing quote.");
}
export function getBasePriceUsd(_roomType: string): never {
  throw new Error("Room pricing is database-driven; request a server pricing quote.");
}
export function getBasePriceLabel(_roomType: string): never {
  throw new Error("Room pricing is database-driven; request a server pricing quote.");
}
export function calculateNightlyRate(_roomType: string, _guests: number): never {
  throw new Error("Room pricing is database-driven; request a server pricing quote.");
}
export function calculateBookingTotal(_roomType: string, _guests: number, _nights = 1): never {
  throw new Error("Room pricing is database-driven; request a server pricing quote.");
}
