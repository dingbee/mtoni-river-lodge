import { createHash } from "node:crypto";
import { inboundReservationSchema, type InboundReservationEvent } from "./contracts";

export function fingerprintInboundEvent(event: InboundReservationEvent): string {
  return createHash("sha256").update([
    event.provider, event.externalAccountId, event.externalPropertyId,
    event.externalReservationId, event.eventId, event.eventType,
    event.eventVersion ?? "", event.rawPayloadFingerprint,
  ].join("\\0")).digest("hex");
}

export type InboundSequenceDecision = "apply" | "duplicate" | "stale" | "manual_review";

export function decideInboundEventSequence(input: {
  existingEventId: string | null;
  existingVersion: string | null;
  incomingEventId: string;
  incomingVersion: string | null;
  providerSupportsVersioning: boolean;
}): InboundSequenceDecision {
  if (input.existingEventId === input.incomingEventId) return "duplicate";
  if (!input.existingEventId) return "apply";
  if (!input.providerSupportsVersioning) return "manual_review";
  if (input.existingVersion === null || input.incomingVersion === null) return "manual_review";
  if (/^\\d+$/.test(input.existingVersion) && /^\\d+$/.test(input.incomingVersion)) {
    const oldVersion = BigInt(input.existingVersion);
    const newVersion = BigInt(input.incomingVersion);
    return newVersion > oldVersion ? "apply" : newVersion === oldVersion ? "duplicate" : "stale";
  }
  return input.existingVersion === input.incomingVersion ? "duplicate" : "manual_review";
}

export function validateInboundEvent(raw: unknown): InboundReservationEvent {
  return inboundReservationSchema.parse(raw);
}

/** External confirmed price is a historical commitment, never a replacement for the live public rate. */
export function buildExternalPriceCommitment(event: InboundReservationEvent) {
  return {
    externalQuotedAmountMinor: event.confirmedAmountMinor,
    externalConfirmedAmountMinor: event.confirmedAmountMinor,
    currency: event.currency,
    taxAmountMinor: event.taxAmountMinor,
    feeAmountMinor: event.feeAmountMinor,
    commissionAmountMinor: event.commissionAmountMinor,
    paymentStatus: event.paymentStatus,
    priceVerificationStatus: event.confirmedAmountMinor === null ? "incomplete" as const : "unverified" as const,
  };
}
