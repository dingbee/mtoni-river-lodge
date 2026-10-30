/** Explicit guest acknowledgement is required before inventory is temporarily held. */
export function isBookingHoldConsentGranted(value: unknown): value is true {
  return value === true;
}

/** A hold is usable only while its server-issued expiry timestamp is still in the future. */
export function isBookingHoldActive(expiresAt: string, nowMs = Date.now()): boolean {
  const expiryMs = Date.parse(expiresAt);
  return Number.isFinite(expiryMs) && expiryMs > nowMs;
}
