import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildBookingPlan, buildBookingUrl, mapAvailabilityForParty, searchAvailability } from "./concierge.tools";
import type { ConciergeIntentSignal } from "./concierge.types";

const propertyId = "11111111-1111-4111-8111-111111111111";
const availableRow = {
  slug: "river-suite",
  name: "River Suite",
  base_price: 100,
  currency: "TZS",
  capacity_adults: 2,
  capacity_children: 1,
  max_occupancy: 3,
  nights: 2,
  nightly_total: 250,
  min_available: 1,
  is_available: true,
  fits_occupancy: true,
  pricing_quote: { ok: true, total: 250, currency: "TZS" },
};

const intent: ConciergeIntentSignal = {
  level: "high",
  confidence: 0.9,
  keywords: ["stay"],
  detected: { check_in: "2026-12-01", check_out: "2026-12-03", adults: 2, children: 0, nights: 2 },
};

describe("Concierge booking handoff", () => {
  it("preserves the exact SPE occupancy buckets in the direct booking URL", () => {
    const url = new URL(buildBookingUrl({
      ...intent,
      detected: {
        ...intent.detected,
        children: 2,
        children_below_6: 1,
        children_7_plus: 1,
      },
    }, "family-suite"), "https://staynas.example");

    expect(url.pathname).toBe("/book");
    expect(url.searchParams.get("check_in")).toBe("2026-12-01");
    expect(url.searchParams.get("check_out")).toBe("2026-12-03");
    expect(url.searchParams.get("adults")).toBe("2");
    expect(url.searchParams.get("children")).toBe("2");
    expect(url.searchParams.get("children_below_6")).toBe("1");
    expect(url.searchParams.get("children_7_plus")).toBe("1");
    expect(url.searchParams.get("room")).toBe("family-suite");
  });
});

describe("Concierge availability contract", () => {
  const rpc = (supabaseAdmin as any).rpc as ReturnType<typeof vi.fn>;

  beforeEach(() => rpc.mockReset());

  it("returns available only when inventory and a valid property-currency quote are confirmed", async () => {
    rpc.mockResolvedValue({ data: [availableRow], error: null });
    const result = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2, children: 0,
    });
    expect(result.status).toBe("available");
    expect(result.rooms[0]).toMatchObject({
      slug: "river-suite", is_available: true, currency: "TZS", nightly_total: 250,
    });
    expect(result.rooms[0]).not.toHaveProperty("base_price");
    expect(rpc).toHaveBeenCalledWith("get_staynas_room_availability_priced", expect.objectContaining({
      _property_id: propertyId, _adults: 2, _check_in: "2026-12-01", _check_out: "2026-12-03",
    }));
  });

  it("distinguishes successfully checked but unavailable inventory", async () => {
    rpc.mockResolvedValue({ data: [{ ...availableRow, is_available: false, min_available: 0 }], error: null });
    const result = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2,
    });
    expect(result.status).toBe("unavailable");
    expect(result.rooms).toHaveLength(1);
  });

  it("rejects invalid dates and guest counts without querying inventory", async () => {
    const invalidDate = await searchAvailability({
      propertyId, check_in: "2026-02-30", check_out: "2026-03-02", adults: 2,
    });
    const invalidParty = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 0,
    });
    expect(invalidDate.status).toBe("invalid_search");
    expect(invalidParty.status).toBe("invalid_search");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not run a public inventory query without a server-resolved property", async () => {
    const result = await searchAvailability({
      propertyId: "", check_in: "2026-12-01", check_out: "2026-12-03", adults: 2,
    });
    expect(result.status).toBe("property_resolution_failure");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires child ages before sending a multi-child SPE pricing request", async () => {
    const result = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2, children: 2,
    });
    expect(result.status).toBe("child_age_breakdown_required");
    expect(result.rooms).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes exact child age buckets to the SPE pricing engine", async () => {
    rpc.mockResolvedValue({ data: [{ ...availableRow, capacity_children: 2, max_occupancy: 4 }], error: null });
    await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2, children: 2,
      childrenBelow6: 1, children7Plus: 1,
    });
    expect(rpc).toHaveBeenCalledWith("get_staynas_room_availability_priced", expect.objectContaining({
      _children_below_6: 1, _children_7_plus: 1,
    }));
  });

  it("distinguishes pricing engine failure from inventory failure", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ ...availableRow, is_available: false, pricing_quote: { ok: false, reason: "rate unavailable" } }],
      error: null,
    });
    const pricing = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Inventory query failed" } });
    const inventory = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2,
    });
    expect(pricing.status).toBe("pricing_service_failure");
    expect(inventory.status).toBe("inventory_service_failure");
    expect(pricing.rooms).toEqual([]);
    expect(inventory.rooms).toEqual([]);
  });

  it("returns a temporary failure rather than an empty inventory result on transport exceptions", async () => {
    rpc.mockRejectedValue(new Error("private provider/database diagnostic"));
    const result = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2,
    });
    expect(result.status).toBe("temporary_failure");
    expect(result.rooms).toEqual([]);
  });

  it("never fabricates a price when the quote currency conflicts with the room currency", async () => {
    rpc.mockResolvedValue({ data: [{ ...availableRow, pricing_quote: { ok: true, total: 250, currency: "USD" } }], error: null });
    const result = await searchAvailability({
      propertyId, check_in: "2026-12-01", check_out: "2026-12-03", adults: 2,
    });
    expect(result.status).toBe("pricing_service_failure");
    expect(result.rooms).toEqual([]);
  });

  it("maps the authoritative pricing quote without a USD fallback", () => {
    const [room] = mapAvailabilityForParty([availableRow], 2, 0);
    expect(room.currency).toBe("TZS");
    expect(room.nightly_total).toBe(250);
  });

  it("creates a booking plan only from validated available room quotes", () => {
    const [room] = mapAvailabilityForParty([availableRow], 2, 0);
    const plan = buildBookingPlan(intent, [room]);
    expect(plan?.room).toMatchObject({ slug: "river-suite", total_price: 250, currency: "TZS" });
    expect(plan?.booking_url).toContain("/book?");
    expect(plan?.currency).toBe("TZS");
  });
});
