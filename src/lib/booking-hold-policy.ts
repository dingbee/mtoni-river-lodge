/** Explicit guest acknowledgement is required before inventory is temporarily held. */
export function isBookingHoldConsentGranted(value: unknown): value is true {
  return value === true;
}
