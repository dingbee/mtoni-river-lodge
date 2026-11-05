import { describe, expect, it } from "vitest";
import {
  assertRatePlanRoomTypeAssignments,
  collectRatePlanRoomTypeReferences,
} from "./rate-plan-publication";

const ROOM_A = "b9061450-e1b5-4f16-9ba5-6e781568be7e";
const ROOM_B = "7e57cca8-b271-497b-b09b-bcfcab036767";
const ROOM_C = "6a3c0a5a-1a6e-4c47-8b20-0a5b6453bbe8";

describe("SPE-03.10 publication integration guard", () => {
  it("collects room-type references from inherited seasonal, daily and restriction data", () => {
    const ids = collectRatePlanRoomTypeReferences({
      seasonal_rates: { peak: { room_type_ids: [ROOM_A, ROOM_B] } },
      daily_rates: {
        "2027-01-01": { [ROOM_B]: { nightly_rate: 200 }, [ROOM_C]: null },
      },
      restrictions: { close: { room_type_ids: [ROOM_A, ROOM_C] } },
    });
    expect(ids).toEqual([ROOM_A, ROOM_B, ROOM_C].sort());
  });

  it("allows publication only when every referenced room type is actively assigned", () => {
    const data = {
      seasonal_rates: { peak: { room_type_ids: [ROOM_A] } },
      daily_rates: { "2027-01-01": { [ROOM_B]: { nightly_rate: 220 } } },
      restrictions: { minStay: { room_type_ids: [ROOM_A, ROOM_B] } },
    };
    expect(() => assertRatePlanRoomTypeAssignments(data, new Set([ROOM_A, ROOM_B]))).not.toThrow();
    expect(() => assertRatePlanRoomTypeAssignments(data, new Set([ROOM_A])))
      .toThrow(/Assign every room type referenced/);
  });

  it("ignores null-cleared inherited daily entries and null restriction keys", () => {
    expect(collectRatePlanRoomTypeReferences({
      daily_rates: { "2027-01-01": { [ROOM_A]: null } },
      restrictions: { cleared: null },
    })).toEqual([]);
  });
});
