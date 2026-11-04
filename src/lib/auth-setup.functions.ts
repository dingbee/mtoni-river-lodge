import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public server fn: returns whether a platform founder administrator exists.
// Used by /auth to auto-disable the temporary signup option after the
// first founder administrator is created. No auth required (read-only boolean).
export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("staynas_platform_admins")
    .select("user_id", { count: "exact", head: true });
  if (error) throw error;
  return { adminExists: (count ?? 0) > 0 };
});

// Called right after signup by the authenticated user. Grants platform founder authority
// ONLY if the platform-admin registry is still empty.
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: countErr } = await supabaseAdmin
      .from("staynas_platform_admins")
      .select("user_id", { count: "exact", head: true });
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) return { granted: false };
    const { error } = await supabaseAdmin
      .from("staynas_platform_admins")
      .insert({ user_id: context.userId, created_by: context.userId });
    if (error && !`${error.message}`.includes("duplicate")) throw error;
    return { granted: true };
  });