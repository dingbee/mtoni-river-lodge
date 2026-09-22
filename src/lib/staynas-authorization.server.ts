import type { SupabaseClient } from "@supabase/supabase-js";
import { hasStayNasEntitlement, type StayNasModuleId } from "@/lib/staynas-entitlements";

export async function requireStayNasModuleAccess(
  supabase: SupabaseClient,
  userId: string,
  moduleId: StayNasModuleId,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const roles = (data ?? []).map((row) => String(row.role));
  if (!hasStayNasEntitlement(moduleId, roles)) {
    throw new Error("Forbidden");
  }
}
