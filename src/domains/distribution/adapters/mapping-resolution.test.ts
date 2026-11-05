import { describe, expect, it } from "vitest";
import { externalReservationSchema } from "../reservations/reservation-ingestion.contracts";
import { resolveReservationDistributionMappings } from "./mapping-resolution";
import type { ReservationMappingSet } from "./mapping-resolution";

const scope = {
  organisationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  connectionId: "50000000-0000-4000-8000-000000000005",
};
const roomTypeA = "30000000-0000-4000-8000-000000000003";
const roomTypeB = "30000000-0000-4000-8000-000000000004";
const ratePlan = "40000000-0000-4000-8000-000000000004";
const event = externalReservationSchema.parse({
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  externalRoomId: "room-1",
  externalRatePlanId: "rate-1",
  providerEventId: "event-1",
  eventType: "reservation.created",
  providerStatus: "confirmed",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-03",
  adults: 2,
  providerPayloadFingerprint: "a".repeat(64),
});
const base: ReservationMappingSet = {
  listings: [{
    ...scope, externalListingId: "listing-1", internalRoomTypeId: roomTypeA, mappingStatus: "active",
  }],
  rooms: [{
    ...scope, externalRoomId: "room-1", internalRoomTypeId: roomTypeA, mappingStatus: "active",
  }],
  ratePlans: [{
    ...scope, externalRatePlanId: "rate-1", internalRatePlanId: ratePlan, mappingStatus: "active",
  }],
};

describe("DC-05.02 reservation mapping resolution", () => {
  it("resolves listing, room type and explicit rate plan within one property", () => {
    expect(resolveReservationDistributionMappings(event, scope, base)).toEqual({
      kind: "resolved",
      propertyId: scope.propertyId,
      roomTypeId: roomTypeA,
      ratePlanId: ratePlan,
      roomResolutionSource: "external_room",
    });
  });

  it("uses listing mapping when the provider omits its room identifier", () => {
    const withoutRoom = { ...event, externalRoomId: undefined };
    expect(resolveReservationDistributionMappings(withoutRoom, scope, {
      ...base, rooms: [],
    })).toMatchObject({ kind: "resolved", roomTypeId: roomTypeA, roomResolutionSource: "external_listing" });
  });

  it("fails closed when listing and room mappings disagree", () => {
    const conflicting = {
      ...base,
      rooms: [{ ...base.rooms[0], internalRoomTypeId: roomTypeB }],
    };
    expect(resolveReservationDistributionMappings(event, scope, conflicting)).toMatchObject({
      kind: "manual_reconciliation", reasons: ["room_mapping_conflict"],
    });
  });

  it("fails closed for missing listing/room and supplied but unmapped rate plan", () => {
    expect(resolveReservationDistributionMappings(event, scope, {
      listings: [], rooms: [], ratePlans: [],
    })).toMatchObject({
      kind: "manual_reconciliation",
      reasons: ["room_mapping_missing", "rate_plan_mapping_missing"],
    });
  });

  it("does not use pending or disabled mappings", () => {
    const inactive = {
      ...base,
      listings: [{ ...base.listings[0], mappingStatus: "pending" as const }],
      rooms: [{ ...base.rooms[0], mappingStatus: "disabled" as const }],
    };
    expect(resolveReservationDistributionMappings(event, scope, inactive)).toMatchObject({
      kind: "manual_reconciliation", reasons: ["room_mapping_missing", "rate_plan_mapping_missing"],
    });
  });

  it("rejects cross-tenant mapping records rather than reusing them", () => {
    const crossTenant = {
      ...base,
      rooms: [{ ...base.rooms[0], propertyId: "20000000-0000-4000-8000-000000000099" }],
    };
    expect(() => resolveReservationDistributionMappings(event, scope, crossTenant)).toThrow(/scope/);
  });
});
