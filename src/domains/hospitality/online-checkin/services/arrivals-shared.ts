/**
 * Online Check-In — staff arrivals dashboard shared contracts.
 * Client-safe: zod schemas, labels and presentation helpers only.
 */
import { z } from "zod";
import type { StatusTone } from "@/components/os/StatusChip";

export const ARRIVAL_ROLES = ["owner", "manager", "reception"] as const;
export const ARRIVAL_MANAGER_ROLES = ["owner", "manager"] as const;

export const CHECKIN_STATUS_FILTERS = [
  "not_started",
  "in_progress",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "no_link",
] as const;
export type CheckInStatusFilter = (typeof CHECKIN_STATUS_FILTERS)[number];

export const DOCUMENT_STATUS_FILTERS = ["none", "pending", "verified", "rejected"] as const;
export type DocumentAggregateStatus = (typeof DOCUMENT_STATUS_FILTERS)[number];

export const RESERVATION_STATUS_FILTERS = [
  "pending",
  "confirmed",
  "checked_in",
  "cancelled",
  "completed",
  "no_show",
] as const;

export const ARRIVAL_SCOPES = ["today", "upcoming", "week", "range"] as const;
export type ArrivalScope = (typeof ARRIVAL_SCOPES)[number];

export const arrivalsFilterSchema = z.object({
  scope: z.enum(ARRIVAL_SCOPES).default("today"),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  checkinStatus: z.enum(CHECKIN_STATUS_FILTERS).optional(),
  documentStatus: z.enum(DOCUMENT_STATUS_FILTERS).optional(),
  reservationStatus: z.enum(RESERVATION_STATUS_FILTERS).optional(),
  roomId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});
export type ArrivalsFilter = z.infer<typeof arrivalsFilterSchema>;

export const arrivalDetailSchema = z.object({ bookingId: z.string().uuid() });

export const REVIEW_ACTIONS = ["approve", "reject", "request_corrections", "reopen"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const reviewCheckInSchema = z.object({
  bookingId: z.string().uuid(),
  action: z.enum(REVIEW_ACTIONS),
  reason: z.string().trim().max(600).optional(),
});

export const staffNoteSchema = z.object({
  bookingId: z.string().uuid(),
  body: z.string().trim().min(2).max(2000),
});

export type ArrivalAlertKind =
  | "missing_documents"
  | "document_rejected"
  | "room_not_ready"
  | "reservation_conflict"
  | "late_arrival"
  | "duplicate_attempt"
  | "failed_verification";

export interface ArrivalAlert {
  kind: ArrivalAlertKind;
  message: string;
  severity: "info" | "warn" | "danger";
}

/** Operational readiness of an arrival, derived from existing reservation,
 *  document and room-state data (no new state is stored). */
export type ArrivalReadiness = "ready" | "attention" | "pending";

export interface ArrivalListItem {
  bookingId: string;
  reference: string;
  guestName: string;
  guestEmail: string;
  guestType: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomId: string;
  roomName: string;
  unitLabel: string | null;
  reservationStatus: string;
  paymentStatus: string;
  checkinStatus: CheckInStatusFilter;
  documentStatus: DocumentAggregateStatus;
  documentCounts: { total: number; verified: number; pending: number; rejected: number };
  roomReadiness: string;
  specialRequests: string | null;
  estimatedArrivalTime: string | null;
  lastActivityAt: string | null;
  alerts: ArrivalAlert[];
}

export interface ArrivalsSummary {
  todayArrivals: number;
  upcoming: number;
  completedCheckIns: number;
  pendingCheckIns: number;
  missingDocuments: number;
  needsReview: number;
  conflicts: number;
  vip: number;
}

export const ARRIVAL_READINESS_LABEL: Record<ArrivalReadiness, string> = {
  ready: "Ready",
  attention: "Needs attention",
  pending: "In progress",
};

export function arrivalReadinessTone(readiness: ArrivalReadiness): StatusTone {
  if (readiness === "ready") return "success";
  if (readiness === "attention") return "danger";
  return "warning";
}

export const ARRIVAL_ALERT_LABEL: Record<ArrivalAlertKind, string> = {
  missing_documents: "Missing documents",
  document_rejected: "Document rejected",
  room_not_ready: "Room not ready",
  reservation_conflict: "Reservation conflict",
  late_arrival: "Late arrival",
  duplicate_attempt: "Duplicate attempts",
  failed_verification: "Failed verification",
};

export const CHECKIN_STATUS_FILTER_LABEL: Record<CheckInStatusFilter, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  no_link: "No link",
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentAggregateStatus, string> = {
  none: "No documents",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};

export function checkinStatusTone(status: CheckInStatusFilter): StatusTone {
  switch (status) {
    case "approved":
      return "success";
    case "submitted":
    case "under_review":
      return "info";
    case "in_progress":
      return "warning";
    case "rejected":
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}

export function documentStatusTone(status: DocumentAggregateStatus): StatusTone {
  switch (status) {
    case "verified":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

export function roomReadinessTone(state: string): StatusTone {
  if (state === "vacant_clean" || state === "occupied") return "success";
  if (state === "vacant_dirty" || state === "inspection") return "warning";
  if (state === "maintenance" || state === "out_of_service") return "danger";
  return "neutral";
}

export function roomReadinessLabel(state: string): string {
  return state
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
