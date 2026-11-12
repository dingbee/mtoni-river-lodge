import { describe, expect, it } from "vitest";
import { validateBookingSearch } from "./booking-search";

describe("concierge direct-booking search validation", () => {
  it("accepts complete dates, party size and SPE child occupancy buckets", () => {
    expect(validateBookingSearch({
      check_in: "2026-12-01",
      check_out: "2026-12-03",
      adults: "2",
      children: "2",
      children_below_6: "1",
      children_7_plus: "1",
      room: "family-suite",
    })).toMatchObject({
      check_in: "2026-12-01",
      check_out: "2026-12-03",
      adults: 2,
      children_below_6: 1,
      children_7_plus: 1,
      room: "family-suite",
    });
  });

  it("rejects invalid dates and inconsistent child counts", () => {
    const result = validateBookingSearch({
      check_in: "2026-02-30",
      check_out: "2026-02-31",
      adults: "2",
      children: "2",
      children_below_6: "1",
      children_7_plus: "0",
    });
    expect(result.check_in).toBeUndefined();
    expect(result.check_out).toBeUndefined();
    expect(result.children_below_6).toBeUndefined();
    expect(result.children_7_plus).toBeUndefined();
  });

  it("keeps the existing booking session and step parameters", () => {
    expect(validateBookingSearch({ step: "2", session: "session-1", room: "suite" }))
      .toMatchObject({ step: 2, session: "session-1", room: "suite" });
  });
  it("preserves a validated campaign offer and attribution context through /book navigation", () => {
    expect(validateBookingSearch({
      step: "2",
      session: "8f6f8c3a-2a61-4a8c-8b7e-3d2a1c4f5e6a",
      property: "mtoni-river-lodge",
      campaign: "resident-escape",
      offer: "50000000-0000-4000-8000-000000000001",
      ratePlan: "51000000-0000-4000-8000-000000000001",
      campaignSession: "8f6f8c3a-2a61-4a8c-8b7e-3d2a1c4f5e6a",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "resident-escape",
      utmContent: "hero-cta",
      utmTerm: "resident",
      referrer: "https://example.com/campaign",
    })).toMatchObject({
      step: 2,
      property: "mtoni-river-lodge",
      campaign: "resident-escape",
      offer: "50000000-0000-4000-8000-000000000001",
      ratePlan: "51000000-0000-4000-8000-000000000001",
      campaignSession: "8f6f8c3a-2a61-4a8c-8b7e-3d2a1c4f5e6a",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "resident-escape",
      utmContent: "hero-cta",
      utmTerm: "resident",
      referrer: "https://example.com/campaign",
    });
  });

  it("drops malformed campaign identifiers and non-HTTP referrers", () => {
    expect(validateBookingSearch({
      property: "../other-tenant",
      campaign: "UPPERCASE",
      offer: "not-a-uuid",
      ratePlan: "not-a-uuid",
      campaignSession: "short",
      referrer: "javascript:alert(1)",
    })).toMatchObject({
      property: undefined,
      campaign: undefined,
      offer: undefined,
      ratePlan: undefined,
      campaignSession: undefined,
      referrer: undefined,
    });
  });

});
