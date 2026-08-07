/**
 * Sprint 2 — Activation Layer: the senses of the Intelligence Core.
 *
 * Browser-safe mapping from existing Mtoni OS platform events to canonical
 * intelligence events. Nothing new is emitted by modules; the bridge simply
 * forwards what the existing Event Bus already publishes.
 */
import type { IntelModule } from "../core/contracts";

export interface IntelEventMapping {
  module: IntelModule;
  eventType: string;
}

/** Platform event type → canonical intelligence event. */
export const PLATFORM_EVENT_MAP: Record<string, IntelEventMapping> = {
  // Booking
  "reservation.created": { module: "booking", eventType: "reservation.created" },
  "reservation.updated": { module: "booking", eventType: "reservation.modified" },
  "reservation.cancelled": { module: "booking", eventType: "reservation.cancelled" },
  "payment.received": { module: "revenue", eventType: "revenue.payment_received" },
  // PMS
  "reservation.checked_in": { module: "pms", eventType: "guest.checked_in" },
  "reservation.checked_out": { module: "pms", eventType: "guest.checked_out" },
  "room.state_changed": { module: "pms", eventType: "room.status_changed" },
  "room.assigned": { module: "pms", eventType: "room.assigned" },
  // Guest Intelligence
  "guest.created": { module: "guest", eventType: "guest.created" },
  "guest.updated": { module: "guest", eventType: "guest.preference.updated" },
  "review.published": { module: "guest", eventType: "guest.feedback.received" },
};

/** Canonical events a module may emit directly (not on the platform bus yet). */
export const CANONICAL_EVENTS = {
  booking: ["reservation.created", "reservation.cancelled", "reservation.modified"],
  pms: ["guest.checked_in", "guest.checked_out", "room.status_changed"],
  guest: ["guest.preference.updated", "guest.feedback.received", "guest.sentiment.changed"],
  revenue: ["occupancy.updated", "rate.changed", "forecast.generated"],
} as const satisfies Partial<Record<IntelModule, readonly string[]>>;

export function mapPlatformEvent(type: string): IntelEventMapping | null {
  return PLATFORM_EVENT_MAP[type] ?? null;
}

/**
 * Reasoning rules — how a signal becomes an insight and a recommendation.
 * Kept declarative so a hospitality executive can read *why* Mtoni said this.
 */
export interface ReasoningRule {
  eventType: string;
  module: IntelModule;
  signalKey: string;
  signalLabel: string;
  /** Absolute percentage deviation from baseline before it becomes an insight. */
  threshold: number;
  insightTitle: (deltaPct: number) => string;
  insightSummary: (deltaPct: number, count: number) => string;
  recommendation: { title: string; suggestedAction: string; actionType: string; impact: string };
  reasoningSources: string[];
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;

export const REASONING_RULES: ReasoningRule[] = [
  {
    eventType: "reservation.created",
    module: "booking",
    signalKey: "booking_velocity",
    signalLabel: "Booking velocity",
    threshold: 25,
    insightTitle: (d) => (d > 0 ? "Reservation spike detected" : "Reservation slowdown detected"),
    insightSummary: (d, c) =>
      `Booking velocity is ${pct(d)} against the recent baseline (${c} new reservations in the current window). Demand is ${d > 0 ? "increasing" : "softening"} for upcoming dates.`,
    recommendation: {
      title: "Review premium room pricing",
      suggestedAction: "Compare current rates for Deluxe and Family rooms against the demand shift before the next weekend.",
      actionType: "revenue.review_pricing",
      impact: "Protects rate integrity during a demand shift",
    },
    reasoningSources: ["booking_velocity", "historical_pattern", "occupancy_forecast"],
  },
  {
    eventType: "reservation.cancelled",
    module: "booking",
    signalKey: "cancellation_rate",
    signalLabel: "Cancellation rate",
    threshold: 30,
    insightTitle: (d) => (d > 0 ? "Cancellations above baseline" : "Cancellations easing"),
    insightSummary: (d, c) =>
      `Cancellations are ${pct(d)} versus baseline (${c} in the current window). Inventory released may need to be resold.`,
    recommendation: {
      title: "Re-open released inventory",
      suggestedAction: "Confirm released rooms are bookable and consider a short-lead offer for the affected dates.",
      actionType: "booking.review_inventory",
      impact: "Recovers revenue from released nights",
    },
    reasoningSources: ["cancellation_rate", "historical_pattern", "inventory_state"],
  },
  {
    eventType: "guest.checked_in",
    module: "pms",
    signalKey: "arrival_volume",
    signalLabel: "Arrival volume",
    threshold: 40,
    insightTitle: (d) => (d > 0 ? "Arrival load above normal" : "Quiet arrival day"),
    insightSummary: (d, c) =>
      `Arrivals are ${pct(d)} versus baseline (${c} check-ins in the current window). Front desk and housekeeping load is affected.`,
    recommendation: {
      title: "Review front desk and housekeeping cover",
      suggestedAction: "Check staffing against the arrival curve and confirm room readiness ahead of peak arrival time.",
      actionType: "operations.review_staffing",
      impact: "Reduces arrival wait time",
    },
    reasoningSources: ["arrival_volume", "room_readiness", "historical_pattern"],
  },
  {
    eventType: "room.status_changed",
    module: "pms",
    signalKey: "room_turnover",
    signalLabel: "Room turnover",
    threshold: 50,
    insightTitle: () => "Room turnover activity shift",
    insightSummary: (d, c) =>
      `Room status changes are ${pct(d)} versus baseline (${c} transitions). Housekeeping throughput may be under pressure.`,
    recommendation: {
      title: "Review housekeeping sequencing",
      suggestedAction: "Re-prioritise cleaning order against today's arrival list.",
      actionType: "operations.review_housekeeping",
      impact: "Improves room readiness before arrivals",
    },
    reasoningSources: ["room_turnover", "arrival_volume"],
  },
  {
    eventType: "guest.feedback.received",
    module: "guest",
    signalKey: "feedback_volume",
    signalLabel: "Guest feedback volume",
    threshold: 30,
    insightTitle: () => "Guest feedback activity shift",
    insightSummary: (d, c) =>
      `Guest feedback volume is ${pct(d)} versus baseline (${c} entries). Sentiment trend should be reviewed.`,
    recommendation: {
      title: "Review guest sentiment trend",
      suggestedAction: "Read the latest reviews and confirm whether any service recovery is required.",
      actionType: "guest.review_sentiment",
      impact: "Protects reputation score",
    },
    reasoningSources: ["feedback_volume", "review_sentiment", "historical_pattern"],
  },
  {
    eventType: "occupancy.updated",
    module: "revenue",
    signalKey: "occupancy_shift",
    signalLabel: "Occupancy shift",
    threshold: 20,
    insightTitle: (d) => (d > 0 ? "Occupancy building" : "Occupancy softening"),
    insightSummary: (d, c) =>
      `Occupancy updates moved ${pct(d)} versus baseline across ${c} updates.`,
    recommendation: {
      title: "Review rate strategy",
      suggestedAction: "Adjust rates for the affected dates in line with the occupancy trend.",
      actionType: "revenue.review_pricing",
      impact: "Optimises RevPAR",
    },
    reasoningSources: ["occupancy_forecast", "booking_velocity", "historical_pattern"],
  },
];

export function ruleFor(module: string, eventType: string): ReasoningRule | undefined {
  return REASONING_RULES.find((r) => r.module === module && r.eventType === eventType);
}