import { describe, expect, it } from "vitest";
import {
  assertSameProperty,
  belongsToProperty,
  filterToProperty,
  BookingPropertyError,
} from "./booking-property";

// Property-isolation regression tests for the public booking engine.
//
// These cover the application-level guard that every booking path
// (availability, holds, booking creation, extras, payment initiation and
// status, booking lookup) now funnels through. The database-level half of
// the isolation lives in
// supabase/review/20261024090000_staynas_booking_property_isolation.sql
// (property-scoped RPC overloads, booking_holds.property_id trigger,
// property-scoped RLS) and can only be proven against a database once that
// reviewed migration is applied to a staging environment — it is
// intentionally NOT applied here.

const MTONI = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("assertSameProperty", () => {
  it("accepts an entity belonging to the configured property", () => {
    expect(() => assertSameProperty(MTONI, MTONI, "Booking")).not.toThrow();
  });

  it("rejects a cross-property booking read", () => {
    expect(() => assertSameProperty(OTHER, MTONI, "Booking")).toThrow(BookingPropertyError);
    expect(() => assertSameProperty(OTHER, MTONI, "Booking")).toThrow(/another property/);
  });

  it("rejects a cross-property hold", () => {
    expect(() => assertSameProperty(OTHER, MTONI, "Hold")).toThrow(BookingPropertyError);
  });

  it("rejects a cross-property extra", () => {
    expect(() => assertSameProperty(OTHER, MTONI, "Extra")).toThrow(BookingPropertyError);
  });

  it("rejects an entity with missing property context", () => {
    expect(() => assertSameProperty(null, MTONI, "Booking")).toThrow(/no property context/);
    expect(() => assertSameProperty(undefined, MTONI, "Booking")).toThrow(/no property context/);
  });

  it("rejects when no booking property is configured", () => {
    expect(() => assertSameProperty(MTONI, "", "Booking")).toThrow(/not configured/);
  });
});

describe("belongsToProperty", () => {
  it("is true only for rows of the given property", () => {
    expect(belongsToProperty({ property_id: MTONI }, MTONI)).toBe(true);
    expect(belongsToProperty({ property_id: OTHER }, MTONI)).toBe(false);
  });

  it("treats missing property_id as foreign", () => {
    expect(belongsToProperty({ property_id: null }, MTONI)).toBe(false);
    expect(belongsToProperty({}, MTONI)).toBe(false);
  });

  it("is false for every row when no property is configured", () => {
    expect(belongsToProperty({ property_id: MTONI }, "")).toBe(false);
  });
});

describe("filterToProperty", () => {
  const rows = [
    { slug: "river-suite", property_id: MTONI },
    { slug: "river-suite", property_id: OTHER }, // same slug, foreign property
    { slug: "garden-room", property_id: MTONI },
    { slug: "legacy-room", property_id: null },
  ];

  it("keeps only the configured property's rows, dropping same-slug foreign rows", () => {
    const out = filterToProperty(rows, MTONI);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.property_id === MTONI)).toBe(true);
  });

  it("drops rows with unknown scope", () => {
    expect(filterToProperty(rows, MTONI).map((r) => r.slug)).not.toContain("legacy-room");
  });

  it("returns nothing when the property id is empty", () => {
    expect(filterToProperty(rows, "")).toHaveLength(0);
  });
});
