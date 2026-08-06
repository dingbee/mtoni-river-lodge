/**
 * Online Check-In — domain types.
 * Mirrors the database foundation (guest_checkins, arrival_information, guest_documents).
 */
import type { Database } from "@/integrations/supabase/types";

export type CheckInStatus = Database["public"]["Enums"]["checkin_status"];
export type CheckInDocumentStatus = Database["public"]["Enums"]["checkin_document_status"];

export type GuestCheckinRow = Database["public"]["Tables"]["guest_checkins"]["Row"];
export type GuestCheckinInsert = Database["public"]["Tables"]["guest_checkins"]["Insert"];
export type GuestCheckinUpdate = Database["public"]["Tables"]["guest_checkins"]["Update"];

export type ArrivalInformationRow = Database["public"]["Tables"]["arrival_information"]["Row"];
export type ArrivalInformationInsert =
  Database["public"]["Tables"]["arrival_information"]["Insert"];
export type ArrivalInformationUpdate =
  Database["public"]["Tables"]["arrival_information"]["Update"];

export type GuestDocumentRow = Database["public"]["Tables"]["guest_documents"]["Row"];
export type GuestDocumentInsert = Database["public"]["Tables"]["guest_documents"]["Insert"];
export type GuestDocumentUpdate = Database["public"]["Tables"]["guest_documents"]["Update"];

/** UI-facing alias kept for the existing scaffolding components. */
export type CheckInLinkStatus = CheckInStatus;

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
