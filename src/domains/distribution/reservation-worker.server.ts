import { runReservationInboxBatch, type ClaimedReservationInboxEvent } from "./reservation-worker";
import { distributionCanonicalReservationWriter } from "./canonical-reservation.server";
import {
  claimDistributionReservationInbox,
  finishDistributionReservationInbox,
  recordDistributionPriceCommitment,
  isDistributionPriceCommitmentVerified,
} from "./persistence.server";

/** Trusted server entrypoint; invoke only from a protected worker/cron execution context. */
export async function runPersistedDistributionReservationInboxBatch(limit = 10) {
  return runReservationInboxBatch({
    claim: async (batchLimit, leaseSeconds) => {
      const rows = await claimDistributionReservationInbox(batchLimit, leaseSeconds) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        inboxId: String(row.inbox_id),
        leaseToken: String(row.lease_token),
        organisationId: String(row.organisation_id),
        propertyId: String(row.property_id),
        connectionId: String(row.connection_id),
        providerEventId: String(row.provider_event_id),
        normalizedPayload: row.normalized_payload as Record<string, unknown>,
        attempt: Number(row.attempt_count ?? 1),
      })) satisfies ClaimedReservationInboxEvent[];
    },
    finish: (input) => finishDistributionReservationInbox(input),
    writer: distributionCanonicalReservationWriter,
    recordPriceCommitment: recordDistributionPriceCommitment,
    isPriceCommitmentVerified: isDistributionPriceCommitmentVerified,
  }, limit);
}
