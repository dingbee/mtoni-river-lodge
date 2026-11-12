import {
  canTransitionBooking,
  type BookingLifecycleStatus,
} from "@/lib/booking-lifecycle";
import type { ExternalReservationEvent } from "./reservation-ingestion.contracts";

export type ProviderReservationState =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "unknown";

export type ReservationReconciliationDecision =
  | Readonly<{ kind: "create"; initialStatus: "pending" | "confirmed" | "cancelled" | "no_show" }>
  | Readonly<{ kind: "transition"; from: BookingLifecycleStatus; to: Exclude<BookingLifecycleStatus, "pending"> }>
  | Readonly<{ kind: "no_lifecycle_change"; reason: "payment_event" | "non_lifecycle_modification" }>
  | Readonly<{ kind: "manual_reconciliation"; reason: "unknown_provider_state" | "unsupported_reinstatement" | "invalid_transition" }>;

function normalizeProviderState(value: string): ProviderReservationState {
  switch (value.trim().toLowerCase()) {
    case "pending":
    case "requested":
      return "pending";
    case "confirmed":
    case "booked":
    case "accepted":
      return "confirmed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "no_show":
    case "no-show":
      return "no_show";
    default:
      return "unknown";
  }
}

/**
 * Converts a verified normalized provider event into a safe lifecycle decision.
 * It never writes a booking or bypasses the canonical lifecycle RPC.
 * Reinstatement is intentionally manual because cancelled bookings are terminal
 * in the current canonical lifecycle graph.
 */
export function resolveReservationLifecycleDecision(
  event: ExternalReservationEvent,
  currentStatus: BookingLifecycleStatus | null,
): ReservationReconciliationDecision {
  if (event.eventType === "reservation.payment_updated" ||
      event.eventType === "reservation.refund_notified") {
    return { kind: "no_lifecycle_change", reason: "payment_event" };
  }

  if (event.eventType === "reservation.reinstated") {
    return { kind: "manual_reconciliation", reason: "unsupported_reinstatement" };
  }

  const providerState = normalizeProviderState(event.providerStatus);
  if (providerState === "unknown") {
    return { kind: "manual_reconciliation", reason: "unknown_provider_state" };
  }

  let target: BookingLifecycleStatus;
  if (event.eventType === "reservation.cancelled") {
    target = "cancelled";
  } else if (event.eventType === "reservation.no_show") {
    target = "no_show";
  } else if (event.eventType === "reservation.created" ||
             event.eventType === "reservation.confirmed") {
    target = providerState === "pending" ? "pending" : providerState === "confirmed"
      ? "confirmed" : providerState;
  } else if (event.eventType === "reservation.modified") {
    if (providerState === "pending" || providerState === "confirmed" ||
        providerState === "cancelled" || providerState === "no_show") {
      target = providerState;
    } else {
      return { kind: "manual_reconciliation", reason: "unknown_provider_state" };
    }
  } else {
    return { kind: "no_lifecycle_change", reason: "non_lifecycle_modification" };
  }

  if (currentStatus === null) {
    return { kind: "create", initialStatus: target };
  }
  if (currentStatus === target) {
    return { kind: "no_lifecycle_change", reason: "non_lifecycle_modification" };
  }
  if (canTransitionBooking(currentStatus, target)) {
    return { kind: "transition", from: currentStatus, to: target as Exclude<BookingLifecycleStatus, "pending"> };
  }
  return { kind: "manual_reconciliation", reason: "invalid_transition" };
}
