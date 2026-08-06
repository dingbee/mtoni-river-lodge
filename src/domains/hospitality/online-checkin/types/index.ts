/**
 * Online Check-In — domain types (foundation only).
 * No business logic is implemented in v1.1 scaffolding.
 */

export type CheckInLinkStatus = "pending" | "in_progress" | "submitted" | "expired";

export interface CheckInLink {
  token: string;
  bookingId: string;
  status: CheckInLinkStatus;
  expiresAt: string;
}

export interface CheckInGuestDetails {
  fullName: string;
  email: string;
  phone?: string;
  country?: string;
  documentNumber?: string;
  estimatedArrivalTime?: string;
  specialRequests?: string;
}

export interface CheckInSubmission {
  token: string;
  guest: CheckInGuestDetails;
  submittedAt: string;
}

export type ArrivalReviewStatus = "awaiting" | "approved" | "rejected";

export interface ArrivalRow {
  bookingId: string;
  reference: string;
  guestName: string;
  roomName?: string;
  checkIn: string;
  linkStatus: CheckInLinkStatus;
  reviewStatus: ArrivalReviewStatus;
}
