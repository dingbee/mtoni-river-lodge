import type { CanonicalReservationWriter } from "./canonical-reservation";
import { applyDistributionReservationEvent } from "./persistence.server";

/** All event types are applied by the same transactionally scoped inbox RPC. */
export const distributionCanonicalReservationWriter: CanonicalReservationWriter = {
  create: ({ inboxId }) => applyDistributionReservationEvent(inboxId),
  modify: ({ inboxId }) => applyDistributionReservationEvent(inboxId),
  cancel: ({ inboxId }) => applyDistributionReservationEvent(inboxId),
};
