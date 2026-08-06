/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase RPC payloads are untyped at this boundary, matching arrivals.server.ts. */
/**
 * QR Arrival Pass — server logic. Access is gated by the same arrivals role
 * set used by the Staff Arrivals dashboard; all reservation state changes are
 * delegated to the existing check-in / reservation sync services.
 */
import { assertArrivalsAccess } from "./arrivals.server";
import type { ScanInput, ScanResult } from "./arrival-pass-shared";

type Sb = any;

async function callPassRpc(
  supabase: Sb,
  fn: "arrival_pass_validate" | "arrival_pass_confirm",
  input: ScanInput,
): Promise<ScanResult> {
  const { data, error } = await supabase.rpc(fn, {
    _pass_token: input.passToken,
    _client: input.client ?? {},
  });
  if (error) throw new Error(error.message);
  return (data ?? {
    ok: false,
    code: "invalid",
    message: "Arrival pass not recognised",
  }) as ScanResult;
}

export async function validatePass(supabase: Sb, userId: string, input: ScanInput) {
  await assertArrivalsAccess(supabase, userId);
  return callPassRpc(supabase, "arrival_pass_validate", input);
}

export async function confirmPass(supabase: Sb, userId: string, input: ScanInput) {
  await assertArrivalsAccess(supabase, userId);
  return callPassRpc(supabase, "arrival_pass_confirm", input);
}
