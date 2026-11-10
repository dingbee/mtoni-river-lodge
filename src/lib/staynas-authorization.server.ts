import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasStayNasEntitlement, type StayNasModuleId } from "@/lib/staynas-entitlements";

export async function requireStayNasModuleAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleId: StayNasModuleId,
): Promise<void> {
  // Resolve authorization from the tenant the user is actively operating,
  // never from global legacy user_roles shared across properties.
  const { data: propertyId, error: propertyError } = await supabase.rpc(
    "staynas_active_property_id",
    { _uid: userId },
  );
  if (propertyError || !propertyId) throw new Error("Select an active property.");

  const { data: membership, error: membershipError } = await (supabase as any)
    .from("staynas_property_members")
    .select("role")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw new Error("Unable to verify property membership.");
  if (!membership?.role) throw new Error("No active membership for the selected property.");

  if (!hasStayNasEntitlement(moduleId, [String(membership.role)])) {
    throw new Error("Forbidden");
  }
}
