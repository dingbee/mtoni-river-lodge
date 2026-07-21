import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public server fn: returns whether an owner user_role exists.
// Used by /auth to auto-disable the temporary signup option after the
// first owner account is created. No auth required (read-only boolean).
export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "owner");
  if (error) throw error;
  return { adminExists: (count ?? 0) > 0 };
});

// Called right after signup by the authenticated user. Grants owner role
// ONLY if no owner exists yet (bootstrap of the first staff account).
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "owner");
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) return { granted: false };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "owner" });
    if (error && !`${error.message}`.includes("duplicate")) throw error;
    return { granted: true };
  });