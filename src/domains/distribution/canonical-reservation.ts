import type { InboundReservationEvent } from "./contracts";
import { buildExternalPriceCommitment, validateInboundEvent } from "./inbound";

export type CanonicalReservationOutcome =
  | { status: "applied"; bookingId: string }
  | { status: "duplicate"; bookingId?: string }
  | { status: "stale" }
  | { status: "manual_review"; reason: string };

/**
 * The canonical writer is intentionally injected. SPE-07 must not write directly
 * to bookings or invent a second reservation lifecycle. The implementation must
 * call the canonical SPE-06 reservation command and persist the external price
 * commitment alongside its result before this boundary can be enabled.
 */
export interface CanonicalReservationWriter {
  create(input: { inboxId: string; event: InboundReservationEvent; externalPrice: ReturnType<typeof buildExternalPriceCommitment> }): Promise<CanonicalReservationOutcome>;
  modify(input: { inboxId: string; event: InboundReservationEvent; externalPrice: ReturnType<typeof buildExternalPriceCommitment> }): Promise<CanonicalReservationOutcome>;
  cancel(input: { inboxId: string; event: InboundReservationEvent }): Promise<CanonicalReservationOutcome>;
}

export async function applyInboundReservationEvent(
  rawEvent: unknown,
  writer: CanonicalReservationWriter,
  inboxId: string,
  priceVerified = false,
): Promise<CanonicalReservationOutcome> {
  const event = validateInboundEvent(rawEvent);
  if (event.eventType === "cancelled") return writer.cancel({ inboxId, event });
  const externalPrice = buildExternalPriceCommitment(event);
  if (externalPrice.priceVerificationStatus === "incomplete" || !priceVerified) {
    return { status: "manual_review", reason: "Provider price has not passed verification; automatic booking creation or modification is prohibited." };
  }
  return event.eventType === "created"
    ? writer.create({ inboxId, event, externalPrice: { ...externalPrice, priceVerificationStatus: "verified" } })
    : writer.modify({ inboxId, event, externalPrice: { ...externalPrice, priceVerificationStatus: "verified" } });
}
