import type { ExternalReservationEvent } from "../reservations/reservation-ingestion.contracts";
import {
  assertDistributionMappingScope,
  type DistributionListingMapping,
  type DistributionRatePlanMapping,
  type DistributionRoomMapping,
} from "./mapping-contracts";

export type DistributionMappingScope = Readonly<{
  organisationId: string;
  propertyId: string;
  connectionId: string;
}>;

export type ReservationMappingSet = Readonly<{
  listings: readonly DistributionListingMapping[];
  rooms: readonly DistributionRoomMapping[];
  ratePlans: readonly DistributionRatePlanMapping[];
}>;

export type ReservationMappingResolution =
  | Readonly<{
      kind: "resolved";
      propertyId: string;
      roomTypeId: string;
      ratePlanId: string | null;
      roomResolutionSource: "external_room" | "external_listing";
    }>
  | Readonly<{
      kind: "manual_reconciliation";
      reasons: readonly (
        | "listing_mapping_missing"
        | "room_mapping_missing"
        | "room_mapping_conflict"
        | "rate_plan_mapping_missing"
      )[];
    }>;

/**
 * Resolves provider resource identity into property-owned canonical resources.
 * External room mapping takes precedence; listing mapping is the fallback.
 * If both exist, they must agree. An explicitly supplied external rate plan
 * must resolve; it is never inferred from a price or room mapping.
 */
export function resolveReservationDistributionMappings(
  event: ExternalReservationEvent,
  scope: DistributionMappingScope,
  mappings: ReservationMappingSet,
): ReservationMappingResolution {
  const all = [...mappings.listings, ...mappings.rooms, ...mappings.ratePlans];
  for (const mapping of all) assertDistributionMappingScope(mapping, scope);

  const activeListing = mappings.listings.filter((m) =>
    m.mappingStatus === "active" && m.externalListingId === event.externalListingId,
  );
  const activeRoom = event.externalRoomId
    ? mappings.rooms.filter((m) => m.mappingStatus === "active" && m.externalRoomId === event.externalRoomId)
    : [];
  const activeRatePlan = event.externalRatePlanId
    ? mappings.ratePlans.filter((m) => m.mappingStatus === "active" && m.externalRatePlanId === event.externalRatePlanId)
    : [];

  const reasons: Array<
    "listing_mapping_missing" | "room_mapping_missing" |
    "room_mapping_conflict" | "rate_plan_mapping_missing"
  > = [];

  const listing = activeListing[0];
  const room = activeRoom[0];
  if (activeListing.length > 1 || activeRoom.length > 1 || activeRatePlan.length > 1) {
    throw new Error("Distribution mapping uniqueness invariant was violated.");
  }

  if (!listing && !room) {
    reasons.push(event.externalRoomId ? "room_mapping_missing" : "listing_mapping_missing");
  }
  if (listing && room && listing.internalRoomTypeId !== room.internalRoomTypeId) {
    reasons.push("room_mapping_conflict");
  }
  if (event.externalRatePlanId && activeRatePlan.length === 0) {
    reasons.push("rate_plan_mapping_missing");
  }

  if (reasons.length) return { kind: "manual_reconciliation", reasons };

  const roomTypeId = room?.internalRoomTypeId ?? listing?.internalRoomTypeId;
  if (!roomTypeId) {
    return { kind: "manual_reconciliation", reasons: ["listing_mapping_missing"] };
  }

  return {
    kind: "resolved",
    propertyId: scope.propertyId,
    roomTypeId,
    ratePlanId: activeRatePlan[0]?.internalRatePlanId ?? null,
    roomResolutionSource: room ? "external_room" : "external_listing",
  };
}
