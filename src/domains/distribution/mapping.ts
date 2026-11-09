import type { DistributionMapping } from "./contracts";

export type MappingCandidate = Pick<
  DistributionMapping,
  "tenantId" | "propertyId" | "connectionId" | "mappingType" | "internalId" | "externalId" | "active"
>;

/** Reject ambiguous mappings; names and fuzzy matching are deliberately not accepted as identity. */
export function validateMappingSet(mappings: MappingCandidate[]): void {
  const internalKeys = new Set<string>();
  const externalKeys = new Set<string>();

  for (const mapping of mappings) {
    if (!mapping.tenantId || !mapping.propertyId || !mapping.connectionId || !mapping.internalId || !mapping.externalId.trim()) {
      throw new Error("Mapping requires explicit tenant, property, connection and both stable identifiers.");
    }
    const scope = [mapping.tenantId, mapping.propertyId, mapping.connectionId, mapping.mappingType].join(":");
    const internalKey = `${scope}:internal:${mapping.internalId}`;
    const externalKey = `${scope}:external:${mapping.externalId}`;
    if (!mapping.active) continue;
    if (internalKeys.has(internalKey)) throw new Error("An internal inventory item has more than one active mapping for this connection.");
    if (externalKeys.has(externalKey)) throw new Error("An external inventory item is mapped more than once for this connection.");
    internalKeys.add(internalKey);
    externalKeys.add(externalKey);
  }
}

export function requireExactMapping(
  mappings: MappingCandidate[],
  scope: Pick<MappingCandidate, "tenantId" | "propertyId" | "connectionId" | "mappingType">,
  internalId: string,
): MappingCandidate {
  const matches = mappings.filter((mapping) =>
    mapping.active &&
    mapping.tenantId === scope.tenantId &&
    mapping.propertyId === scope.propertyId &&
    mapping.connectionId === scope.connectionId &&
    mapping.mappingType === scope.mappingType &&
    mapping.internalId === internalId,
  );
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? "No active external mapping exists for this item." : "Mapping is ambiguous; distribution is blocked.");
  }
  return matches[0];
}
