import type { AdapterExecutionContext } from "../adapters/contracts";
import { assertVerifiedReservationWebhook, type VerifiedReservationWebhook } from "./provider-signature-verification.server";
import { receiveDistributionWebhook, storeEncryptedReservationPayload } from "../adapters/operation-ledger.server";
import {
  encryptReservationPayload,
  readReservationPayloadKey,
  readReservationPayloadKeyVersion,
  reservationPayloadAad,
} from "./reservation-payload-crypto.server";
import { toSafeReservationEventEnvelope, type ExternalReservationEvent } from "./reservation-ingestion.contracts";

/**
 * Reservation ingress context is assembled by the trusted server-side connection
 * resolver. Grant and external-account identifiers are deliberately part of this
 * context rather than independent ingress arguments, so a webhook caller cannot
 * pair an authorized connection with a different grant/account identifier.
 */
export type ReservationIngressExecutionContext = AdapterExecutionContext & Readonly<{
  accountGrantId: string;
  externalAccountId: string;
}>;

export type IngestExternalReservationInput = Readonly<{
  verifiedWebhook: VerifiedReservationWebhook;
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
  assertVerifiedReservationWebhook(input.verifiedWebhook);
  const event: ExternalReservationEvent = input.verifiedWebhook.event;
  const context = input.verifiedWebhook.context;
  if (!context.accountGrantId.trim() || !context.externalAccountId.trim()) {
    throw new Error("Distribution account grant and external account must be resolved server-side.");
  }
  if (event.providerKey !== context.providerKey ||
      event.externalAccountReference !== context.externalAccountReference) {
    throw new Error("Provider event does not match the authorized distribution connection.");
  }
  if (context.capability !== "reservation.import" &&
      context.capability !== "reservation.update" &&
      context.capability !== "reservation.cancel") {
    throw new Error("Distribution connection does not grant reservation ingestion capability.");
  }

  const key = readReservationPayloadKey();
  const keyVersion = readReservationPayloadKeyVersion();
  const encryptedPayload = encryptReservationPayload(
    event,
    key,
    reservationPayloadAad(context.providerKey, context.externalAccountId, event.providerEventId),
    keyVersion,
  );
  const safeEnvelope = toSafeReservationEventEnvelope(event);
  const payloadFingerprint = encryptedPayload.payloadFingerprint;

  const stored = await receiveDistributionWebhook({
    context,
    accountGrantId: context.accountGrantId,
    externalAccountId: context.externalAccountId,
    providerEventId: event.providerEventId,
    eventType: event.eventType,
    normalizedEvent: safeEnvelope,
    payloadFingerprint,
  });

  await storeEncryptedReservationPayload({
    inboxId: stored.inboxId,
    payloadFingerprint,
    ciphertext: encryptedPayload.ciphertext,
    nonce: encryptedPayload.nonce,
    authTag: encryptedPayload.authTag,
    keyVersion: encryptedPayload.keyVersion,
  });

  return Object.freeze({
    inboxId: stored.inboxId,
    created: stored.created,
    correlationId: context.correlationId,
  });
}
