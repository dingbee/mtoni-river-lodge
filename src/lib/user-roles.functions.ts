import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { staynasRpc } from "@/lib/staynas-rpc";

/**
 * Returns the current signed-in user's roles from the active property membership.
 * Backed by the property-scoped StayNas role RPC.
 */
export const getCurrentUserRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await staynasRpc(context.supabase).rpc("staynas_current_property_roles");
    if (error) throw new Error(error.message);
    return (data ?? []) as string[];
  });