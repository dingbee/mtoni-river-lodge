import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasStayNasEntitlement, type StayNasModuleId } from "@/lib/staynas-entitlements";
import { staynasRpc } from "@/lib/staynas-rpc";

/**
 * Authorize an operational module against the authenticated user's explicitly
 * selected property membership. Global user_roles are not an operational
 * tenant authority: they are legacy platform-level assignments and must never
 * grant access to a customer property's modules.
 *
 * The RPC derives auth.uid() server-side and resolves the membership for the
 * active property context. Its database implementation must also reject
 * suspended properties and organisations.
 */
export async function requireStayNasModuleAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleId: StayNasModuleId,
): Promise<void> {
  if (!userId) throw new Error("Forbidden");

  const { data: propertyRoles, error } = await staynasRpc(supabase).rpc("staynas_current_property_roles");

  if (error) {
    throw new Error("Unable to verify the active property's access role.");
  }

  const roles = Array.isArray(propertyRoles) ? propertyRoles.map(String) : [];
  if (!hasStayNasEntitlement(moduleId, roles)) {
    throw new Error("Forbidden");
  }
}
