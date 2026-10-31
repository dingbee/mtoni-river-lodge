import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve operational AI roles from the user's explicitly selected active
 * property. Global user_roles are not authoritative for a multitenant request.
 */
export async function getActivePropertyAiRoles(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<{ propertyId: string; roles: string[] }> {
  if (!userId) throw new Error("Forbidden");

  const { data: context, error: contextError } = await (supabase as any)
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (contextError) throw new Error("Unable to verify the active property context.");
  if (!context?.property_id) {
    throw new Error("Select an active property before using operational AI.");
  }

  const { data: membership, error: membershipError } = await (supabase as any)
    .from("staynas_property_members")
    .select("role")
    .eq("user_id", userId)
    .eq("property_id", context.property_id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) throw new Error("Unable to verify active property membership.");
  if (!membership?.role) throw new Error("No active membership for the selected property.");

  return { propertyId: String(context.property_id), roles: [String(membership.role)] };
}

/**
 * Platform-wide AI configuration is controlled only by the Nolmark founder
 * administrator predicate. Tenant-level owner roles never grant this access.
 */
export async function assertFounderAiAdmin(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  if (!userId) throw new Error("Forbidden");
  const { data, error } = await (supabase as any).rpc("is_staynas_founder_ai_admin");
  if (error) throw new Error("Unable to verify founder AI administration access.");
  if (data !== true) throw new Error("Forbidden: Nolmark founder administration only.");
}
