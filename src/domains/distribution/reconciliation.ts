export type DistributionExceptionStatus = "open" | "investigating" | "resolved" | "dismissed";
export type DistributionExceptionKind =
  | "rate_mismatch" | "availability_mismatch" | "restriction_mismatch"
  | "unmapped_room_type" | "unmapped_rate_plan" | "duplicate_external_booking"
  | "missing_reservation" | "modification_failed" | "cancellation_failed"
  | "currency_mismatch" | "pricing_mismatch" | "connection_failed" | "stale_sync";

export interface DistributionException {
  id: string;
  tenantId: string;
  propertyId: string;
  connectionId: string;
  kind: DistributionExceptionKind;
  status: DistributionExceptionStatus;
  summary: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  resolvedBy: string | null;
}

export function transitionDistributionException(
  current: DistributionException,
  next: DistributionExceptionStatus,
  actorUserId: string,
  resolution?: string,
): DistributionException {
  if (!actorUserId.trim()) throw new Error("An authenticated actor is required.");
  if (current.status === "dismissed" || current.status === "resolved") {
    throw new Error("A closed distribution exception cannot be changed.");
  }
  if (next === "open") throw new Error("An exception cannot be reopened through a status transition.");
  if (next === "resolved" && (!resolution || resolution.trim().length < 8)) {
    throw new Error("A meaningful resolution note is required.");
  }
  if (next === "dismissed" && (!resolution || resolution.trim().length < 8)) {
    throw new Error("A dismissal reason is required.");
  }
  if (next === "investigating" && current.status !== "open") {
    throw new Error("Only open exceptions can enter investigation.");
  }
  return {
    ...current,
    status: next,
    resolvedAt: next === "resolved" || next === "dismissed" ? new Date().toISOString() : null,
    resolution: next === "resolved" || next === "dismissed" ? resolution!.trim() : null,
    resolvedBy: next === "resolved" || next === "dismissed" ? actorUserId : null,
  };
}
