import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Safe capability check for rendering founder-only navigation.
 * All privileged operations remain independently authorized by their own
 * server functions and database policies.
 */
export const getFounderAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("is_staynas_founder_ai_admin");
    if (error) throw new Error("Unable to verify Nolmark founder administration access.");
    return { isFounderAdmin: data === true };
  });
