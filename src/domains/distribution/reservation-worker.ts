import { applyInboundReservationEvent, type CanonicalReservationWriter } from "./canonical-reservation";

export interface ClaimedReservationInboxEvent {
  inboxId: string;
  leaseToken: string;
  organisationId: string;
  propertyId: string;
  connectionId: string;
  providerEventId: string;
  normalizedPayload: Record<string, unknown>;
  attempt: number;
}

export interface ReservationInboxWorkerDependencies {
  claim(limit: number, leaseSeconds: number): Promise<ClaimedReservationInboxEvent[]>;
  finish(input: {
    inboxId: string;
    leaseToken: string;
    status: "applied" | "duplicate" | "stale" | "manual_review" | "failed";
    bookingId?: string;
    errorCode?: string;
    safeErrorMessage?: string;
    retryAt?: string;
  }): Promise<boolean>;
  writer: CanonicalReservationWriter;
  recordPriceCommitment(inboxId: string): Promise<string>;
  isPriceCommitmentVerified(inboxId: string): Promise<boolean>;
  now?: () => Date;
}

export interface ReservationInboxWorkerReport {
  claimed: number;
  applied: number;
  duplicate: number;
  stale: number;
  manualReview: number;
  failed: number;
  leaseLost: number;
}

/** Applies provider events through the canonical reservation command only. */
export async function runReservationInboxBatch(
  deps: ReservationInboxWorkerDependencies,
  limit = 10,
): Promise<ReservationInboxWorkerReport> {
  const items = await deps.claim(limit, 120);
  const report: ReservationInboxWorkerReport = {
    claimed: items.length, applied: 0, duplicate: 0, stale: 0,
    manualReview: 0, failed: 0, leaseLost: 0,
  };

  for (const item of items) {
    try {
      const payload = item.normalizedPayload;
      let priceVerified = false;
      if (payload.eventType !== "cancelled" && payload.confirmedAmountMinor !== null
        && payload.confirmedAmountMinor !== undefined && typeof payload.currency === "string") {
        await deps.recordPriceCommitment(item.inboxId);
        priceVerified = await deps.isPriceCommitmentVerified(item.inboxId);
      }
      const outcome = await applyInboundReservationEvent(payload, deps.writer, item.inboxId, priceVerified);
      const status = outcome.status;
      const saved = await deps.finish({
        inboxId: item.inboxId, leaseToken: item.leaseToken, status,
        ...(outcome.status === "applied" && { bookingId: outcome.bookingId }),
        ...(outcome.status === "manual_review" && {
          errorCode: "CANONICAL_MANUAL_REVIEW",
          safeErrorMessage: outcome.reason.slice(0, 500),
        }),
      });
      if (!saved) {
        report.leaseLost += 1;
      } else if (status === "applied") report.applied += 1;
      else if (status === "duplicate") report.duplicate += 1;
      else if (status === "stale") report.stale += 1;
      else report.manualReview += 1;
    } catch {
      const retryAt = new Date((deps.now?.() ?? new Date()).getTime() + Math.min(3600, 15 * (2 ** Math.max(0, item.attempt - 1))) * 1000).toISOString();
      const saved = await deps.finish({
        inboxId: item.inboxId, leaseToken: item.leaseToken, status: "failed",
        errorCode: "CANONICAL_RESERVATION_APPLY_FAILED",
        safeErrorMessage: "Canonical reservation command failed; retry or inspect in Distribution Centre.",
        retryAt,
      });
      if (saved) report.failed += 1;
      else report.leaseLost += 1;
    }
  }
  return report;
}
