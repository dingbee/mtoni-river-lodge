import { createServerFn } from "@tanstack/react-start";

// Public server fn: returns whether an admin user_role exists.
// Used by /auth to auto-disable the temporary signup option after the
// first admin account is created. No auth required (read-only boolean).
export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw error;
  return { adminExists: (count ?? 0) > 0 };
});