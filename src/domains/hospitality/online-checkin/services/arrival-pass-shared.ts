/**
 * QR Arrival Pass — shared contracts.
 * The QR payload carries only an opaque pass token; every field a human sees
 * is resolved live from the Mtoni OS reservation engine.
 */
import { z } from "zod";

export const ARRIVAL_PASS_QR_PREFIX = "MTONI-PASS:";

export type ArrivalPassStatus = "active" | "used" | "revoked" | "expired";

export type ArrivalPassCode =
  | "valid"
  | "confirmed"
  | "invalid"
  | "expired"
  | "used"
  | "revoked"
  | "cancelled"
  | "ineligible"
  | "reservation_changed"
  | "room_conflict"
  | "not_submitted";

export const passTokenSchema = z
  .string()
  .trim()
  .min(24)
  .max(200)
  .transform(normalisePassToken)
  .refine((v) => /^[a-f0-9]{32,96}$/i.test(v), "Not a Mtoni arrival pass code");

export const scanInputSchema = z.object({
  passToken: passTokenSchema,
  client: z.record(z.string(), z.string()).optional(),
});
export type ScanInput = z.infer<typeof scanInputSchema>;

/** Accept a raw token, the `MTONI-PASS:` payload, or a full pass URL. */
export function normalisePassToken(raw: string): string {
  let value = (raw ?? "").trim();
  if (value.startsWith(ARRIVAL_PASS_QR_PREFIX)) {
    value = value.slice(ARRIVAL_PASS_QR_PREFIX.length);
  }
  if (/^https?:\/\//i.test(value)) {
    const parts = value.split(/[/?#]/).filter(Boolean);
    value = parts[parts.length - 1] ?? value;
  }
  return value.trim();
}

export function buildQrPayload(token: string): string {
  return `${ARRIVAL_PASS_QR_PREFIX}${token}`;
}

export function passStatusTone(
  status: ArrivalPassStatus | string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "used":
      return "info";
    case "expired":
      return "warning";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

export const PASS_STATUS_LABEL: Record<string, string> = {
  active: "Valid",
  used: "Arrival completed",
  expired: "Expired",
  revoked: "Revoked",
};

export interface ArrivalPassStay {
  guest_name: string;
  reference: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  room_name: string;
  unit_label: string | null;
  reservation_status: string;
}

export interface ArrivalPassView {
  status: ArrivalPassStatus;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  token: string;
}

export interface ScanReservation {
  id: string;
  reference: string;
  status: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  room_name: string;
  unit_label: string | null;
  payment_status: string;
  balance_amount: number | null;
  currency: string;
  checked_in_at: string | null;
  special_requests: string | null;
  estimated_arrival_time: string | null;
}

export interface ScanResult {
  ok: boolean;
  code: ArrivalPassCode;
  message: string;
  pass?: ArrivalPassView & { id: string; scan_count: number };
  reservation?: ScanReservation;
  checkin?: { id: string; status: string; submitted_at: string | null };
  documents?: { total?: number; verified?: number; rejected?: number };
  eligibility?: { ok: boolean; code: string; message: string };
  sync?: { ok?: boolean; unit_label?: string | null } | null;
}
