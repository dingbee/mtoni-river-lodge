import { describe, expect, it } from "vitest";
import {
  assertDistributionMappingScope,
  validateDistributionListingMapping,
  validateDistributionRatePlanMapping,
  validateDistributionRoomMapping,
} from "./mapping-contracts";

const scope = {
  organisationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  connectionId: "50000000-0000-4000-8000-000000000005",
  mappingStatus: "active" as const,
};
const roomTypeId = "30000000-0000-4000-8000-000000000003";

describe("DC-05.02 canonical mapping contracts", () => {
  it("maps an external listing to a canonical property room type", () => {
    expect(validateDistributionListingMapping({
      ...scope, externalListingId: "ota-listing-42", internalRoomTypeId: roomTypeId,
    }).internalRoomTypeId).toBe(roomTypeId);
  });

  it("maps an external room type to a canonical property room type", () => {
    expect(validateDistributionRoomMapping({
      ...scope, externalRoomId: "ota-room-type-42", internalRoomTypeId: roomTypeId,
    }).internalRoomTypeId).toBe(roomTypeId);
  });

  it("maps an external rate plan to a canonical StayNas RatePlan ID", () => {
    const ratePlanId = "40000000-0000-4000-8000-000000000004";
    expect(validateDistributionRatePlanMapping({
      ...scope, externalRatePlanId: "ota-flexible-rate", internalRatePlanId: ratePlanId,
    }).internalRatePlanId).toBe(ratePlanId);
  });

  it("rejects legacy numeric price values and unsafe provider identifiers", () => {
    expect(() => validateDistributionRatePlanMapping({
      ...scope, externalRatePlanId: "ota-rate", internalRatePlanId: "260",
    })).toThrow();
    expect(() => validateDistributionRoomMapping({
      ...scope, externalRoomId: "room\nsecret", internalRoomTypeId: roomTypeId,
    })).toThrow();
  });

  it("rejects cross-property or cross-connection mapping reuse", () => {
    const mapping = {
      ...scope, externalRoomId: "ota-room-type-42", internalRoomTypeId: roomTypeId,
    };
    expect(() => assertDistributionMappingScope(mapping, {
      organisationId: scope.organisationId,
      propertyId: "20000000-0000-4000-8000-000000000099",
      connectionId: scope.connectionId,
    })).toThrow(/scope/);
  });
});
