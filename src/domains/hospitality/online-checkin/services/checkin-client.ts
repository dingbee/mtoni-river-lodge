/**
 * Online Check-In — guest-facing client.
 * All access runs through token-scoped database functions; the guest is
 * anonymous and never reads the check-in tables directly.
 */
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { CheckInStatus } from "../types";

export const guestInfoSchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  adults: z.coerce.number().int().min(1).max(10),
  children: z.coerce.number().int().min(0).max(10),
  signature_name: z.string().trim().max(120).optional().or(z.literal("")),
});
export type GuestInfoValues = z.infer<typeof guestInfoSchema>;

export const arrivalInfoSchema = z.object({
  arrival_date: z.string().trim().max(20).optional().or(z.literal("")),
  estimated_arrival_time: z.string().trim().max(10).optional().or(z.literal("")),
  arrival_mode: z.string().trim().max(40).optional().or(z.literal("")),
  flight_number: z.string().trim().max(30).optional().or(z.literal("")),
  airport: z.string().trim().max(80).optional().or(z.literal("")),
  transfer_required: z.boolean(),
  transfer_notes: z.string().trim().max(500).optional().or(z.literal("")),
  visit_purpose: z.string().trim().max(120).optional().or(z.literal("")),
  dietary_requirements: z.string().trim().max(500).optional().or(z.literal("")),
  accessibility_needs: z.string().trim().max(500).optional().or(z.literal("")),
  special_requests: z.string().trim().max(1000).optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(120).optional().or(z.literal("")),
  emergency_contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  emergency_contact_relation: z.string().trim().max(60).optional().or(z.literal("")),
});
export type ArrivalInfoValues = z.infer<typeof arrivalInfoSchema>;

export interface CheckInSummary {
  reference: string;
  check_in: string;
  check_out: string;
  nights: number;
  room_name: string;
  status: CheckInStatus;
  expires_at: string;
  email_hint: string;
  surname_hint: string;
}

export interface VerifiedCheckIn {
  checkin: {
    id: string;
    status: CheckInStatus;
    expires_at: string;
    submitted_at: string | null;
    signature_name: string | null;
    metadata: Record<string, unknown> | null;
  };
  booking: {
    reference: string;
    check_in: string;
    check_out: string;
    nights: number;
    adults: number;
    children: number;
    guest_name: string;
    guest_email: string;
    guest_phone: string | null;
    country: string | null;
    room_name: string;
  };
  arrival: Record<string, unknown> | null;
}

function message(error: { message?: string } | null, fallback: string) {
  const raw = error?.message ?? "";
  return raw.replace(/^.*?:\s*/, "").trim() || fallback;
}

export async function fetchCheckInSummary(token: string): Promise<CheckInSummary | null> {
  const { data, error } = await supabase.rpc("checkin_fetch_summary", { _token: token });
  if (error) throw new Error(message(error, "Unable to load this check-in link"));
  const row = Array.isArray(data) ? data[0] : null;
  return (row as CheckInSummary | undefined) ?? null;
}

export async function verifyCheckIn(token: string, answer: string): Promise<VerifiedCheckIn> {
  const { data, error } = await supabase.rpc("checkin_verify", { _token: token, _answer: answer });
  if (error) throw new Error(message(error, "We could not verify your reservation"));
  return data as unknown as VerifiedCheckIn;
}

export async function submitCheckIn(params: {
  token: string;
  answer: string;
  guest: GuestInfoValues;
  arrival: ArrivalInfoValues;
  final?: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("checkin_submit", {
    _token: params.token,
    _answer: params.answer,
    _guest: params.guest as unknown as never,
    _arrival: params.arrival as unknown as never,
    _final: params.final ?? true,
  });
  if (error) throw new Error(message(error, "We could not submit your check-in"));
}
