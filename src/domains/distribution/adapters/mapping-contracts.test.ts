import { describe, expect, it } from "vitest";
import {
  assertDistributionMappingScope,
  validateDistributionRatePlanMapping,
  validateDistributionRoomMapping,
} from "./mapping-contracts";

const scope = {
  organisationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  connectionId: "50000000-0000-4000-8000-000000000005",
  mappingStatus: "active" as const,
};

describe("DC-04.12 canonical mapping contracts", () => {
  it("maps an external room identifier to a canonical StayNas room", () => {
    expect(validateDistributionRoomMapping({
      ...scope,
      externalRoomId: "ota-room-type-42",
      internalRoomId: "30000000-0000-4000-8000-000000000003",
    }).internalRoomId).toBe("30000000-0000-4000-8000-000000000003");
  });

  it("maps an external rate plan to a canonical StayNas RatePlan ID", () => {
    expect(validateDistributionRatePlanMapping({
      ...scope,
      externalRatePlanId: "ota-flexible-rate",
      internalRatePlanId: "40000000-0000-4000-8000-000000000004",
    }).internalRatePlanId).toBe("40000000-0000-4000-8000-000000000004");
  });

  it("rejects legacy numeric price values and unsafe provider identifiers", () => {
    expect(() => validateDistributionRatePlanMapping({
      ...scope, externalRatePlanId: "ota-rate", internalRatePlanId: "260",
    })).toThrow();
    expect(() => validateDistributionRoomMapping({
      ...scope, externalRoomId: "room\nsecret", internalRoomId: "30000000-0000-4000-8000-000000000003",
    })).toThrow();
  });

  it("rejects cross-property or cross-connection mapping reuse", () => {
    const mapping = {
      ...scope,
      externalRoomId: "ota-room-type-42",
      internalRoomId: "30000000-0000-4000-8000-000000000003",
    };
    expect(() => assertDistributionMappingScope(mapping, {
      organisationId: scope.organisationId,
      propertyId: "20000000-0000-4000-8000-000000000099",
      connectionId: scope.connectionId,
    })).toThrow(/scope/);
  });
});
