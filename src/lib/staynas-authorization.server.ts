import type { SupabaseClient } from "@supabase/supabase-js";
import { hasStayNasEntitlement, type StayNasModuleId } from "@/lib/staynas-entitlements";

export async function requireStayNasModuleAccess(
  supabase: SupabaseClient,
  userId: string,
  moduleId: StayNasModuleId,
): Promise<void> {
  // userId remains part of the authorization contract; the RPC derives the
  // roles from the authenticated caller rather than relying on a direct
  // user_roles SELECT, which is intentionally blocked by RLS.
  void userId;

  const { data, error } = await supabase.rpc("current_user_roles");

  if (error) throw new Error(error.message);

  const roles = (data ?? []).map((role) => String(role));
  if (!hasStayNasEntitlement(moduleId, roles)) {
    throw new Error("Forbidden");
  }
}
