import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform-wide AI configuration is controlled only by an active owner of the
 * Nolmark CDMA founder property. Tenant owners and staff are deliberately
 * excluded even when they hold elevated roles within their own property.
 */
export async function assertFounderAiAdmin(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  if (!userId) throw new Error("Forbidden");

  const { data, error } = await (supabase as any).rpc(
    "is_staynas_founder_ai_admin",
  );

  if (error) throw new Error("Unable to verify founder AI administration access.");
  if (data !== true) throw new Error("Forbidden: Nolmark founder administration only.");
}
