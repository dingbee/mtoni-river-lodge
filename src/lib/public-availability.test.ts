import { describe, expect, it } from "vitest";
import { mapPublicAvailability, plausibleGuestEmail, quoteRatePlanId, searchedNightlyRate, toPublicCatalogRoom } from "./public-availability";

const nolmark = { name: "Nolmark CDMA", currency: "TZS" };

// Row shape returned by get_staynas_room_availability_priced_with_rate_plan after
// the currency-integrity migration (observed in the local replay, Test A step A4).
const tzsRow = {
  room_id: "e0000000-0000-4000-8000-000000000001",
  slug: "deluxe-double",
  name: "Deluxe Double",
  base_price: null,
  currency: "TZS",
  nights: 1,
  nightly_total: 125000,
  min_available: 3,
  is_available: true,
  fits_occupancy: true,
  pricing_quote: { currency: "TZS", total: 125000, accommodation_subtotal: 125000 },
};

describe("guest availability currency contract (Nolmark CDMA, TZS 125,000)", () => {
  it("shows the priced amount with the quote currency", () => {
    const [room] = mapPublicAvailability([tzsRow], new Map(), nolmark);
    expect(room.currency).toBe("TZS");
    expect(room.nightly_total).toBe(125000);
    expect(room.base_price).toBeNull();
  });

  it("never labels a TZS quote with a stale legacy room currency", () => {
    // Pre-fix database row (replay step B4): currency=USD while the quote is TZS.
    const [room] = mapPublicAvailability([{ ...tzsRow, currency: "USD", base_price: 80 }], new Map(), nolmark);
    expect(room.currency).toBe("TZS");
    expect(room.nightly_total).toBe(125000);
  });

  it("fails visibly when the priced quote is not in the property currency", () => {
    expect(() => mapPublicAvailability([{ ...tzsRow, pricing_quote: { currency: "USD", total: 80 } }], new Map(), nolmark))
      .toThrow("Pricing rejected [CURRENCY_MISMATCH]: Deluxe Double is priced in USD but Nolmark CDMA sells in TZS");
  });

  it("fails visibly when a guest would be offered a plan in another currency", () => {
    const row = { ...tzsRow, nightly_total: 0, pricing_quote: { ok: false, error_code: "RATE_PLAN_REQUIRED" } };
    const plans = new Map([[tzsRow.room_id, [{ currency: "TZS" }, { currency: "USD" }]]]);
    expect(() => mapPublicAvailability([row], plans, nolmark)).toThrow(/CURRENCY_MISMATCH/);
  });

  it("surfaces the resolver's own error instead of a generic failure", () => {
    const row = { ...tzsRow, pricing_quote: { ok: false, error_code: "CURRENCY_MISMATCH", message: "Published rate plans for this room are priced in USD but the property sells in TZS; re-price them in TZS" } };
    expect(() => mapPublicAvailability([row], new Map(), nolmark))
      .toThrow("Pricing rejected [CURRENCY_MISMATCH]: Published rate plans for this room are priced in USD but the property sells in TZS");
  });

  it("drops rooms with no eligible plan without affecting other rooms", () => {
    const other = { ...tzsRow, room_id: "other", slug: "other", pricing_quote: { ok: false, error_code: "NO_ELIGIBLE_RATE_PLAN" } };
    expect(mapPublicAvailability([tzsRow, other], new Map(), nolmark).map((r) => r.slug)).toEqual(["deluxe-double"]);
  });
});

describe("guest catalogue room rates", () => {
  it("publishes an indicative rate only in the property currency", () => {
    expect(toPublicCatalogRoom({ base_price: "125000.00", currency: "TZS", extra_guest_fee: "0" }, nolmark))
      .toMatchObject({ base_price: 125000, currency: "TZS", extra_guest_fee: 0 });
    expect(toPublicCatalogRoom({ base_price: "80.00", currency: "USD", extra_guest_fee: "10" }, nolmark))
      .toMatchObject({ base_price: null, currency: "TZS", extra_guest_fee: null });
    expect(toPublicCatalogRoom({ base_price: "0.00", currency: "TZS" }, nolmark).base_price).toBeNull();
  });
});

describe("searched per-night rate on the room card", () => {
  const deluxe = (nightly: Array<{ nightly_rate: number }>) => ({
    currency: "TZS",
    pricing_quote: { currency: "TZS", total: 940000, nightly },
  });

  it("shows the exact TZS 235,000 rate for a 4-night Deluxe search, not the stored indicative price", () => {
    expect(searchedNightlyRate(deluxe(Array(4).fill({ nightly_rate: 235000 }))))
      .toEqual({ amount: 235000, currency: "TZS", uniform: true });
  });

  it("uses the lowest exact night as a 'from' price when nightly rates differ", () => {
    expect(searchedNightlyRate(deluxe([{ nightly_rate: 235000 }, { nightly_rate: 260000 }])))
      .toEqual({ amount: 235000, currency: "TZS", uniform: false });
  });

  it("returns nothing when there is no priced quote", () => {
    expect(searchedNightlyRate({ currency: "TZS", pricing_quote: { ok: false, error_code: "RATE_PLAN_REQUIRED" } })).toBeNull();
    expect(searchedNightlyRate({ currency: "TZS", pricing_quote: { currency: "TZS", nightly: [] } })).toBeNull();
  });
});

describe("guest email gate for the final quote", () => {
  it("accepts real addresses (previously every address was rejected, blocking booking)", () => {
    expect(plausibleGuestEmail("test1nolmark@gmail.com")).toBe("test1nolmark@gmail.com");
    expect(plausibleGuestEmail("  bob@example.com ")).toBe("bob@example.com");
    expect(plausibleGuestEmail("a.b+tag@mail.co.tz")).toBe("a.b+tag@mail.co.tz");
  });

  it("rejects incomplete addresses", () => {
    for (const value of ["", "bob", "bob@", "bob@example", "bob @example.com", "@example.com"]) {
      expect(plausibleGuestEmail(value)).toBe("");
    }
  });
});

describe("rate plan used for the final quote", () => {
  // Production shape for Deluxe (single eligible plan): no choice list, plan in evidence.
  const deluxe = { rate_plan_options: [], pricing_quote: { currency: "TZS", pricing_evidence: { rate_plan_id: "f815cd7e-c6d8-46d1-a6c9-12e39459c519" } } };

  it("uses the priced plan for single-plan rooms (previously empty, so no quote and no booking)", () => {
    expect(quoteRatePlanId(deluxe, "")).toBe("f815cd7e-c6d8-46d1-a6c9-12e39459c519");
  });

  it("prefers the guest's explicit choice, then a single offered plan", () => {
    expect(quoteRatePlanId(deluxe, "chosen")).toBe("chosen");
    expect(quoteRatePlanId({ rate_plan_options: [{ rate_plan_id: "only" }] }, "")).toBe("only");
  });

  it("requires a choice when several plans are offered", () => {
    expect(quoteRatePlanId({ rate_plan_options: [{ rate_plan_id: "a" }, { rate_plan_id: "b" }], pricing_quote: { pricing_evidence: { rate_plan_id: "a" } } }, "")).toBe("");
  });
});
