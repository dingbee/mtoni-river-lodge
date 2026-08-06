/**
 * QR Arrival Pass — guest-facing client.
 * Anonymous guests never read `arrival_passes`; both calls are token-scoped
 * SECURITY DEFINER functions that re-check the live reservation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ArrivalPassStay, ArrivalPassView } from "./arrival-pass-shared";

export interface ArrivalPassPayload {
  pass: ArrivalPassView;
  stay: ArrivalPassStay;
}

function fail(error: { message?: string } | null, fallback: string) {
  return new Error((error?.message ?? "").replace(/^.*?:\s*/, "").trim() || fallback);
}

/** Issue (or resume) the arrival pass for a completed online check-in. */
export async function ensureArrivalPass(checkinToken: string): Promise<string> {
  const { data, error } = await supabase.rpc("arrival_pass_ensure", {
    _checkin_token: checkinToken,
  });
  if (error) throw fail(error, "We could not prepare your arrival pass");
  const result = (data ?? {}) as { ok?: boolean; token?: string; message?: string };
  if (!result.ok || !result.token) {
    throw new Error(result.message ?? "Your arrival pass is not available yet");
  }
  return result.token;
}

export async function fetchArrivalPass(passToken: string): Promise<ArrivalPassPayload | null> {
  const { data, error } = await supabase.rpc("arrival_pass_fetch", { _pass_token: passToken });
  if (error) throw fail(error, "We could not load this arrival pass");
  const result = (data ?? {}) as { ok?: boolean } & Partial<ArrivalPassPayload>;
  if (!result.ok || !result.pass || !result.stay) return null;
  return { pass: result.pass, stay: result.stay };
}
