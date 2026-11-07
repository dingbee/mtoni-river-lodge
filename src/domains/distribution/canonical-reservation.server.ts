import type { CanonicalReservationOutcome, CanonicalReservationWriter } from "./canonical-reservation";
import { applyDistributionReservationEvent } from "./persistence.server";

async function apply(inboxId: string): Promise<CanonicalReservationOutcome> {
  const result = await applyDistributionReservationEvent(inboxId);
  if (result.status === "applied") {
    if (!result.bookingId) throw new Error("Canonical distribution apply returned no linked booking.");
    return { status: "applied", bookingId: result.bookingId };
  }
  if (result.status === "duplicate") {
    return { status: "duplicate", ...(result.bookingId ? { bookingId: result.bookingId } : {}) };
  }
  if (result.status === "stale") return { status: "stale" };
  return { status: "manual_review", reason: result.reason ?? "External reservation requires staff review." };
}

/** All event types are applied by the same transactionally scoped inbox RPC. */
export const distributionCanonicalReservationWriter: CanonicalReservationWriter = {
  create: ({ inboxId }) => apply(inboxId),
  modify: ({ inboxId }) => apply(inboxId),
  cancel: ({ inboxId }) => apply(inboxId),
};
