// Property-isolation guards for the public booking engine.
//
// Pure functions — no I/O — so the cross-property rejection rules are unit
// testable without a database. Every booking path (availability, holds,
// booking creation, extras, payments, lookups) must funnel through these
// guards plus the configured-property resolver in booking-property.server.ts.

export class BookingPropertyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingPropertyError";
  }
}

/**
 * Throws unless `entityPropertyId` is present and exactly matches the
 * configured booking property. `label` names the entity for the error
 * message (e.g. "Booking", "Hold", "Extra").
 */
export function assertSameProperty(
  entityPropertyId: string | null | undefined,
  configuredPropertyId: string,
  label: string,
): void {
  if (!configuredPropertyId) {
    throw new BookingPropertyError("Booking property is not configured");
  }
  if (!entityPropertyId) {
    throw new BookingPropertyError(`${label} has no property context`);
  }
  if (entityPropertyId !== configuredPropertyId) {
    throw new BookingPropertyError(`${label} belongs to another property`);
  }
}

/**
 * Returns true only when the row belongs to the given property. Rows with a
 * missing property_id never pass — unknown scope is treated as foreign.
 */
export function belongsToProperty(
  row: { property_id?: string | null },
  propertyId: string,
): boolean {
  return Boolean(propertyId) && row.property_id === propertyId;
}

/**
 * Filters a list of property-owned rows down to the given property,
 * dropping rows with missing or foreign property scope.
 */
export function filterToProperty<T extends { property_id?: string | null }>(
  rows: readonly T[],
  propertyId: string,
): T[] {
  return rows.filter((r) => belongsToProperty(r, propertyId));
}
