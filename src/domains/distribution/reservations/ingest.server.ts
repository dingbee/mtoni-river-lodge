import { createHash } from "node:crypto";
import type { AdapterExecutionContext } from "../adapters/contracts";
import { receiveDistributionWebhook } from "../adapters/operation-ledger.server";
import {
  externalReservationSchema,
  toSafeReservationEventEnvelope,
  type ExternalReservationEvent,
} from "./reservation-ingestion.contracts";

export type IngestExternalReservationInput = Readonly<{
  /** Must be resolved from server-loaded connection, grant and account rows. */
  context: AdapterExecutionContext;
  accountGrantId: string;
  externalAccountId: string;
  event: unknown;
}>;

export type IngestExternalReservationResult = Readonly<{
  inboxId: string;
  created: boolean;
  correlationId: string;
}>;

/**
 * Durable provider-neutral ingress. The caller must complete provider-specific
 * signature verification and resolve the execution context from trusted
 * server-side records before invoking this function. No caller-supplied
 * organisation/property identifiers or raw provider body are accepted.
 *
 * Guest contact and monetary values are intentionally excluded from the
 * DC-04 inbox payload. The full verified event remains in the caller's
 * transient processing scope until the canonical reservation transaction
 * persists it to the StayNas booking/finance domains.
 */
export async function ingestExternalReservationEvent(
  input: IngestExternalReservationInput,
): Promise<IngestExternalReservationResult> {
  const event: ExternalReservationEvent = externalReservationSchema.parse(input.event);
  if (event.providerKey !== input.context.providerKey ||
      event.externalAccountReference !== input.context.externalAccountReference) {
    throw new Error("Provider event does not match the authorized distribution connection.");
  }
  if (input.context.capability !== "reservation.import" &&
      input.context.capability !== "reservation.update" &&
      input.context.capability !== "reservation.cancel") {
    throw new Error("Distribution connection does not grant reservation ingestion capability.");
  }

  const safeEnvelope = toSafeReservationEventEnvelope(event);
  const payloadFingerprint = createHash("sha256")
    .update(JSON.stringify(safeEnvelope))
    .digest("hex");

  const stored = await receiveDistributionWebhook({
    context: input.context,
    accountGrantId: input.accountGrantId,
    externalAccountId: input.externalAccountId,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    normalizedEvent: safeEnvelope,
    payloadFingerprint,
  });

  return Object.freeze({
    inboxId: stored.inboxId,
    created: stored.created,
    correlationId: input.context.correlationId,
  });
}
