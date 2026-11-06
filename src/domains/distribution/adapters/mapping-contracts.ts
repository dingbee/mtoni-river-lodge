import { z } from "zod";

/**
 * Provider identifiers map to canonical property resources, never prices or
 * physical room inventory rows. A mapped room type is later resolved by the
 * canonical allocator to a physical room with available inventory.
 */
const externalResourceId = z.string().trim().min(1).max(256)
  .regex(/^[A-Za-z0-9._:-]+$/, "External identifiers must be opaque safe identifiers.");

const mappingScopeSchema = z.object({
  organisationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  connectionId: z.string().uuid(),
  mappingStatus: z.enum(["pending", "active", "disabled"]),
});

export const distributionListingMappingSchema = mappingScopeSchema.extend({
  externalListingId: externalResourceId,
  internalRoomTypeId: z.string().uuid(),
});

export const distributionRoomMappingSchema = mappingScopeSchema.extend({
  externalRoomId: externalResourceId,
  internalRoomTypeId: z.string().uuid(),
});

export const distributionRatePlanMappingSchema = mappingScopeSchema.extend({
  externalRatePlanId: externalResourceId,
  /** Canonical StayNas RatePlan.id; never a legacy price field or provider-owned ID. */
  internalRatePlanId: z.string().uuid(),
});

export type DistributionListingMapping = z.infer<typeof distributionListingMappingSchema>;
export type DistributionRoomMapping = z.infer<typeof distributionRoomMappingSchema>;
export type DistributionRatePlanMapping = z.infer<typeof distributionRatePlanMappingSchema>;

export function validateDistributionListingMapping(input: unknown): DistributionListingMapping {
  return distributionListingMappingSchema.parse(input);
}
export function validateDistributionRoomMapping(input: unknown): DistributionRoomMapping {
  return distributionRoomMappingSchema.parse(input);
}
export function validateDistributionRatePlanMapping(input: unknown): DistributionRatePlanMapping {
  return distributionRatePlanMappingSchema.parse(input);
}

/** Prevent a mapping loaded for one execution context from being reused by another. */
export function assertDistributionMappingScope(
  mapping: Pick<DistributionRoomMapping, "organisationId" | "propertyId" | "connectionId">,
  expected: Readonly<{ organisationId: string; propertyId: string; connectionId: string }>,
): void {
  if (mapping.organisationId !== expected.organisationId ||
      mapping.propertyId !== expected.propertyId ||
      mapping.connectionId !== expected.connectionId) {
    throw new Error("Distribution mapping does not belong to the active connection and property scope.");
  }
}
