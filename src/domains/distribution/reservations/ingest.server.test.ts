import { describe, expect, it } from "vitest";
import { requiredReservationCapability } from "./ingest.server";

describe("DC-05.04 provider event capability mapping", () => {
  it("requires import permission for create and confirm", () => {
    expect(requiredReservationCapability({ eventType: "reservation.created", providerStatus: "confirmed" })).toBe("reservation.import");
    expect(requiredReservationCapability({ eventType: "reservation.confirmed", providerStatus: "confirmed" })).toBe("reservation.import");
  });

  it("requires cancel permission for explicit cancellation events", () => {
    expect(requiredReservationCapability({ eventType: "reservation.cancelled", providerStatus: "cancelled" })).toBe("reservation.cancel");
  });

  it("does not allow a modified event to cancel without cancellation permission", () => {
    expect(requiredReservationCapability({ eventType: "reservation.modified", providerStatus: "cancelled" })).toBe("reservation.cancel");
    expect(requiredReservationCapability({ eventType: "reservation.modified", providerStatus: "canceled" })).toBe("reservation.cancel");
  });

  it("keeps ordinary modifications and no-show events on update permission", () => {
    expect(requiredReservationCapability({ eventType: "reservation.modified", providerStatus: "confirmed" })).toBe("reservation.update");
    expect(requiredReservationCapability({ eventType: "reservation.no_show", providerStatus: "no_show" })).toBe("reservation.update");
    expect(requiredReservationCapability({ eventType: "reservation.reinstated", providerStatus: "confirmed" })).toBe("reservation.update");
  });
});
