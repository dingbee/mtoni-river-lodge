import { describe, expect, it } from "vitest";
import { externalReservationSchema } from "./reservation-ingestion.contracts";
import { assessReservationMaterializationReadiness } from "./materialization-readiness";

const event = (guest: Record<string, string> = {}) => externalReservationSchema.parse({
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  providerEventId: "event-1",
  eventType: "reservation.created",
  providerStatus: "confirmed",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-04",
  adults: 2,
  children: 0,
  providerPayloadFingerprint: "a".repeat(64),
  guest,
});

const resolved = {
  propertyResolved: true,
  roomResolved: true,
  ratePlanRequired: false,
  ratePlanResolved: false,
};

describe("DC-05 canonical booking materialization readiness", () => {
  it("allows materialization only with resolved property/room and guest name/email", () => {
    expect(assessReservationMaterializationReadiness(
      event({ firstName: "Amina", lastName: "Mushi", email: "amina@example.com" }),
      resolved,
    )).toEqual({ kind: "ready" });
  });

  it("routes missing guest email to manual reconciliation without fabricating contact data", () => {
    expect(assessReservationMaterializationReadiness(
      event({ firstName: "Amina", lastName: "Mushi" }),
      resolved,
    )).toEqual({ kind: "manual_reconciliation", reasons: ["guest_email_missing"] });
  });

  it("routes missing guest name to manual reconciliation", () => {
    expect(assessReservationMaterializationReadiness(
      event({ email: "amina@example.com" }),
      resolved,
    )).toEqual({ kind: "manual_reconciliation", reasons: ["guest_name_missing"] });
  });

  it("holds materialization while property, room or required rate plan mappings are unresolved", () => {
    expect(assessReservationMaterializationReadiness(
      event({ firstName: "Amina", email: "amina@example.com" }),
      {
        propertyResolved: false,
        roomResolved: false,
        ratePlanRequired: true,
        ratePlanResolved: false,
      },
    )).toEqual({
      kind: "manual_reconciliation",
      reasons: [
        "property_mapping_missing",
        "room_mapping_missing",
        "rate_plan_mapping_missing",
      ],
    });
  });

  it("does not require a rate-plan mapping when the provider contract does not require one", () => {
    expect(assessReservationMaterializationReadiness(
      event({ firstName: "Amina", email: "amina@example.com" }),
      resolved,
    )).toEqual({ kind: "ready" });
  });

  it("requires explicit child age bands when children affect published-plan pricing", () => {
    const withChildren = externalReservationSchema.parse({
      providerKey: "airbnb",
      externalAccountReference: "account-1",
      externalReservationId: "reservation-children",
      externalListingId: "listing-1",
      providerEventId: "event-children",
      eventType: "reservation.created",
      providerStatus: "confirmed",
      arrivalDate: "2026-12-01",
      departureDate: "2026-12-04",
      adults: 2,
      children: 2,
      providerPayloadFingerprint: "b".repeat(64),
      guest: { firstName: "Amina", lastName: "Mushi", email: "amina@example.com" },
    });
    expect(assessReservationMaterializationReadiness(withChildren, resolved)).toEqual({
      kind: "manual_reconciliation",
      reasons: ["child_age_breakdown_missing"],
    });
  });

  it("accepts complete child age bands only when they reconcile to the total", () => {
    const withChildren = externalReservationSchema.parse({
      providerKey: "airbnb",
      externalAccountReference: "account-1",
      externalReservationId: "reservation-children",
      externalListingId: "listing-1",
      providerEventId: "event-children",
      eventType: "reservation.created",
      providerStatus: "confirmed",
      arrivalDate: "2026-12-01",
      departureDate: "2026-12-04",
      adults: 2,
      children: 2,
      childrenBelow6: 1,
      children7Plus: 1,
      providerPayloadFingerprint: "c".repeat(64),
      guest: { firstName: "Amina", lastName: "Mushi", email: "amina@example.com" },
    });
    expect(assessReservationMaterializationReadiness(withChildren, resolved)).toEqual({ kind: "ready" });
  });
});
