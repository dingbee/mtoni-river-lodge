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
  locked: boolean;
  has_draft: boolean;
  draft_step: number;
  submitted_at: string | null;
  /** Live reservation eligibility, resolved by the Reservation engine. */
  eligible: boolean;
  eligibility_code: string;
  eligibility_message: string;
}

/** Snapshot of the reservation the guest started checking in against. */
export interface ReservationSnapshot {
  fingerprint: string;
  status: string;
  room_id: string | null;
  room_name: string;
  check_in: string;
  check_out: string;
}

export interface VerifiedCheckIn {
  checkin: {
    id: string;
    status: CheckInStatus;
    expires_at: string;
    submitted_at: string | null;
    signature_name: string | null;
    metadata: Record<string, unknown> | null;
    draft: { guest?: Partial<GuestInfoValues>; arrival?: Partial<ArrivalInfoValues> } | null;
    draft_step: number;
    resumed: boolean;
    session_id: string | null;
    last_activity_at: string | null;
    session_timeout_seconds: number;
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
  eligibility?: { ok: boolean; code: string; message: string; snapshot: ReservationSnapshot };
  arrival: Record<string, unknown> | null;
}

function message(error: { message?: string } | null, fallback: string) {
  const raw = error?.message ?? "";
  return raw.replace(/^.*?:\s*/, "").trim() || fallback;
}

export type CheckInRefusalCode =
  | "invalid"
  | "expired"
  | "locked"
  | "conflict"
  | "session"
  | "verify_failed"
  | "validation"
  // Reservation-engine refusals
  | "not_found"
  | "cancelled"
  | "already_checked_in"
  | "ineligible"
  | "not_confirmed"
  | "room_invalid"
  | "too_early"
  | "window_closed"
  | "reservation_changed"
  | "room_conflict";

/** Refusal returned by the database instead of an exception, so the audit row commits. */
export class CheckInError extends Error {
  code: CheckInRefusalCode;
  constructor(code: CheckInRefusalCode, msg: string) {
    super(msg);
    this.name = "CheckInError";
    this.code = code;
  }
}

function unwrap(payload: unknown, fallback: string) {
  const result = (payload ?? {}) as { ok?: boolean; code?: CheckInRefusalCode; message?: string };
  if (result.ok === false) {
    throw new CheckInError(result.code ?? "invalid", result.message ?? fallback);
  }
  return result;
}

/** Session timeout mirrored from the database (30 minutes). */
export const CHECKIN_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const SESSION_PREFIX = "mtoni.checkin.session.";

/**
 * Stable per-browser session id for one check-in token. Persisted so a
 * reload resumes the same session instead of colliding with itself.
 */
export function getCheckInSessionId(token: string): string {
  const key = SESSION_PREFIX + token.slice(0, 12);
  if (typeof window === "undefined") return "ssr-session-placeholder";
  let existing = window.localStorage.getItem(key);
  if (!existing || existing.length < 8) {
    existing = `s_${crypto.randomUUID().replace(/-/g, "")}`;
    window.localStorage.setItem(key, existing);
  }
  return existing;
}

export function clearCheckInSessionId(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_PREFIX + token.slice(0, 12));
}

/** Non-identifying device context recorded on the check-in audit trail. */
export function getClientContext(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
    user_agent: window.navigator.userAgent.slice(0, 300),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  };
}

export async function fetchCheckInSummary(token: string): Promise<CheckInSummary | null> {
  const { data, error } = await supabase.rpc("checkin_fetch_summary", { _token: token });
  if (error) throw new Error(message(error, "Unable to load this check-in link"));
  const row = Array.isArray(data) ? data[0] : null;
  return (row as CheckInSummary | undefined) ?? null;
}

export async function verifyCheckIn(
  token: string,
  answer: string,
  sessionId: string,
): Promise<VerifiedCheckIn> {
  const { data, error } = await supabase.rpc("checkin_verify", {
    _token: token,
    _answer: answer,
    _session_id: sessionId,
  });
  if (error) throw new Error(message(error, "We could not verify your reservation"));
  unwrap(data, "We could not verify your reservation");
  return data as unknown as VerifiedCheckIn;
}

/** Autosave the wizard state after a completed step. */
export async function saveCheckInDraft(params: {
  token: string;
  sessionId: string;
  guest: GuestInfoValues | null;
  arrival: ArrivalInfoValues;
  step: number;
}): Promise<void> {
  const { data, error } = await supabase.rpc("checkin_save_draft", {
    _token: params.token,
    _session_id: params.sessionId,
    _guest: (params.guest ?? {}) as unknown as never,
    _arrival: params.arrival as unknown as never,
    _step: params.step,
  });
  if (error) throw new Error(message(error, "We could not save your progress"));
  unwrap(data, "We could not save your progress");
}

export async function submitCheckIn(params: {
  token: string;
  answer: string;
  guest: GuestInfoValues;
  arrival: ArrivalInfoValues;
  final?: boolean;
  sessionId?: string;
}): Promise<{ room_ready?: boolean; message?: string }> {
  const { data, error } = await supabase.rpc("checkin_submit", {
    _token: params.token,
    _answer: params.answer,
    _guest: params.guest as unknown as never,
    _arrival: params.arrival as unknown as never,
    _final: params.final ?? true,
    _session_id: params.sessionId ?? undefined,
    _client: getClientContext() as unknown as never,
  });
  if (error) throw new Error(message(error, "We could not submit your check-in"));
  const result = unwrap(data, "We could not submit your check-in") as {
    room_ready?: boolean;
    message?: string;
  };
  return result;
}
