import { describe, expect, it } from "vitest";
import { externalReservationSchema } from "./reservation-ingestion.contracts";
import { resolveReservationLifecycleDecision } from "./lifecycle-reconciliation";

const base = {
  providerKey: "airbnb", externalAccountReference: "account-1",
  externalReservationId: "reservation-1", externalListingId: "listing-1",
  providerEventId: "event-1", providerStatus: "confirmed",
  arrivalDate: "2026-12-01", departureDate: "2026-12-04",
  adults: 2, children: 0, providerPayloadFingerprint: "a".repeat(64),
};
const event = (eventType: string, providerStatus = "confirmed") =>
  externalReservationSchema.parse({ ...base, eventType, providerStatus, ...(eventType === "reservation.payment_updated" ? { paymentStatus: "captured" } : {}) });

describe("DC-05 lifecycle reconciliation policy", () => {
  it("creates a confirmed canonical reservation from a confirmed provider event", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.created"), null))
      .toEqual({ kind: "create", initialStatus: "confirmed" });
  });

  it("transitions pending reservations to confirmed", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.confirmed"), "pending"))
      .toEqual({ kind: "transition", from: "pending", to: "confirmed" });
  });

  it("permits cancellation only through the existing lifecycle graph", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.cancelled", "cancelled"), "confirmed"))
      .toEqual({ kind: "transition", from: "confirmed", to: "cancelled" });
    expect(resolveReservationLifecycleDecision(event("reservation.cancelled", "cancelled"), "checked_in"))
      .toEqual({ kind: "manual_reconciliation", reason: "invalid_transition" });
  });

  it("does not reopen terminal cancelled reservations automatically", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.reinstated"), "cancelled"))
      .toEqual({ kind: "manual_reconciliation", reason: "unsupported_reinstatement" });
  });

  it("routes unknown provider states to manual reconciliation", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.modified", "in_house"), "confirmed"))
      .toEqual({ kind: "manual_reconciliation", reason: "unknown_provider_state" });
  });

  it("keeps payment and refund events outside reservation lifecycle", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.payment_updated"), "confirmed"))
      .toEqual({ kind: "no_lifecycle_change", reason: "payment_event" });
    expect(resolveReservationLifecycleDecision(event("reservation.refund_notified"), "confirmed"))
      .toEqual({ kind: "no_lifecycle_change", reason: "payment_event" });
  });

  it("does not regress an unchanged reservation", () => {
    expect(resolveReservationLifecycleDecision(event("reservation.modified"), "confirmed"))
      .toEqual({ kind: "no_lifecycle_change", reason: "non_lifecycle_modification" });
  });
});
