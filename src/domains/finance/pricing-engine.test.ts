import { describe, expect, it } from "vitest";
import { calculatePricingQuote, type PricingRoom, type PropertyPricingRule } from "./pricing-engine";

const room: PricingRoom = {
  id: "room-a",
  propertyId: "property-a",
  basePrice: 120,
  currency: "USD",
  includedGuests: 2,
  extraGuestFee: 25,
  capacityAdults: 2,
  capacityChildren: 1,
  maxOccupancy: 3,
};

const rule = (overrides: Partial<PropertyPricingRule>): PropertyPricingRule => ({
  id: "rule-a",
  propertyId: "property-a",
  ruleType: "seasonal",
  priority: 100,
  active: true,
  ...overrides,
  it("matches the read-only Nolmark CDMA room baseline", () => {
    const propertyId = "f44ff48a-5449-4464-b0cb-83295fadb468";
    const rooms: PricingRoom[] = [
      {
        id: "00cc9cf8-73b2-4b56-96f1-ca91418bdb47",
        propertyId,
        basePrice: 120,
        currency: "USD",
        includedGuests: 2,
        extraGuestFee: 25,
        capacityAdults: 2,
        capacityChildren: 1,
        maxOccupancy: 3,
      },
      {
        id: "17231e70-a8e2-41f0-8d7b-363df40f0c01",
        propertyId,
        basePrice: 165,
        currency: "USD",
        includedGuests: 2,
        extraGuestFee: 30,
        capacityAdults: 2,
        capacityChildren: 1,
        maxOccupancy: 3,
      },
      {
        id: "90eb5492-1901-4853-a95a-280822bd4b02",
        propertyId,
        basePrice: 240,
        currency: "USD",
        includedGuests: 4,
        extraGuestFee: 0,
        capacityAdults: 4,
        capacityChildren: 2,
        maxOccupancy: 6,
      },
    ];
    const quote = (room: PricingRoom, occupancy: { adults: number; childrenBelow6?: number; children7Plus?: number }) =>
      calculatePricingQuote({
        room,
        checkIn: "2026-11-10",
        checkOut: "2026-11-12",
        occupancy,
        inventory: [],
        rules: [],
      });

    expect(quote(rooms[0], { adults: 2, childrenBelow6: 1 }).subtotal).toBe(240);
    expect(quote(rooms[0], { adults: 2, children7Plus: 1 }).subtotal).toBe(290);
    expect(quote(rooms[1], { adults: 2 }).subtotal).toBe(330);
    expect(quote(rooms[2], { adults: 4, childrenBelow6: 2 }).subtotal).toBe(480);
    expect(rooms.every((room) => room.currency === "USD")).toBe(true);
  });

});

describe("calculatePricingQuote", () => {
  it("prices per night with a free under-six child and paid extra occupancy", () => {
    const quote = calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
      occupancy: { adults: 2, childrenBelow6: 1, children7Plus: 0 },
      inventory: [],
      rules: [],
    });
    expect(quote.subtotal).toBe(240);
    expect(quote.nightly.map((night) => night.nightlyRate)).toEqual([120, 120]);
    expect(quote.currency).toBe("USD");
  });

  it("applies the extra-guest fee to paid occupants above the included count", () => {
    const quote = calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2, children7Plus: 1 },
      inventory: [],
      rules: [],
    });
    expect(quote.subtotal).toBe(145);
  });

  it("uses a daily inventory override before the rule adjustment", () => {
    const quote = calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2 },
      inventory: [{ date: "2026-11-10", priceOverride: 150 }],
      rules: [rule({ adjustmentKind: "percent", adjustmentValue: 10 })],
    });
    expect(quote.nightly[0].baseRate).toBe(150);
    expect(quote.subtotal).toBe(165);
  });

  it("prefers a room-specific rule over a higher-priority property-wide rule", () => {
    const quote = calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2 },
      inventory: [],
      rules: [
        rule({ id: "property", priority: 1, adjustmentKind: "percent", adjustmentValue: 20 }),
        rule({ id: "room", roomId: "room-a", priority: 99, adjustmentKind: "percent", adjustmentValue: 5 }),
      ],
    });
    expect(quote.subtotal).toBe(126);
    expect(quote.nightly[0].appliedRuleId).toBe("room");
  });

  it("rejects a rule belonging to another property", () => {
    const quote = calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2 },
      inventory: [],
      rules: [rule({ propertyId: "property-b", adjustmentKind: "override", adjustmentValue: 1 })],
    });
    expect(quote.subtotal).toBe(120);
  });

  it("enforces blackout and minimum-stay constraints", () => {
    expect(() => calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2 },
      inventory: [],
      rules: [rule({ ruleType: "blackout" })],
    })).toThrow(/blackout/i);

    expect(() => calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2 },
      inventory: [],
      rules: [rule({ ruleType: "min_stay", minStayNights: 2 })],
    })).toThrow(/minimum stay/i);
  });

  it("rejects missing currency and occupancy violations", () => {
    expect(() => calculatePricingQuote({
      room: { ...room, currency: "" },
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 2 },
      inventory: [],
      rules: [],
    })).toThrow(/currency/i);

    expect(() => calculatePricingQuote({
      room,
      checkIn: "2026-11-10",
      checkOut: "2026-11-11",
      occupancy: { adults: 3 },
      inventory: [],
      rules: [],
    })).toThrow(/capacity/i);
  });
});
