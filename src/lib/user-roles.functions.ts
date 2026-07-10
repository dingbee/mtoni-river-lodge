import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the current signed-in user's roles from public.user_roles.
 * Backed by the current_user_roles() SQL helper.
 */
export const getCurrentUserRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("current_user_roles");
    if (error) throw new Error(error.message);
    return (data ?? []) as string[];
  });