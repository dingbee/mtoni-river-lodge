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

/** Resolve the caller's roles from the explicitly selected, active property. */
export async function getStayNasActivePropertyRoles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await staynasRpc(supabase).rpc("staynas_current_property_roles");
  if (error) throw new Error("Unable to verify the active property's access role.");
  return Array.isArray(data) ? data.map(String) : [];
}

/** Require one of the supplied roles in the selected active property. */
export async function requireStayNasPropertyRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  allowedRoles: readonly string[],
): Promise<void> {
  const roles = await getStayNasActivePropertyRoles(supabase, userId);
  if (!allowedRoles.some((role) => roles.includes(role))) throw new Error("Forbidden");
}

/** Require any operational staff membership in the selected active property. */
export async function requireStayNasStaffAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await requireStayNasPropertyRole(supabase, userId, [
    "owner", "manager", "reception", "marketing", "housekeeping",
    "finance", "admin", "reservations", "editor",
  ]);
}

/** Preserve the legacy is_staff role boundary, but evaluate it property-locally. */
export async function requireStayNasCoreStaffAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  await requireStayNasPropertyRole(supabase, userId, [
    "owner", "manager", "admin", "reservations",
  ]);
}

/** Require membership in the canonical platform founder-admin registry. */
export async function requireStayNasFounderAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  if (!userId) throw new Error("Forbidden");
  const { data, error } = await supabase
    .from("staynas_platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Unable to verify founder administration access.");
  if (!data) throw new Error("Forbidden: StayNas founder administration required.");
}
