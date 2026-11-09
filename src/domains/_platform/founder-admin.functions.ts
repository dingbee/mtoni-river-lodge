import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Legacy AI-founder capability. Kept separate because existing AI endpoints
 * independently enforce the legacy authorization contract.
 */
export const getFounderAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("is_staynas_founder_ai_admin");
    if (error) throw new Error("Unable to verify Nolmark founder AI administration access.");
    return { isFounderAdmin: data === true };
  });

/**
 * CC-03 founder capability. This is the authoritative platform commercial
 * founder check: configured founder tenant + explicit founder membership +
 * active property membership, all evaluated against the authenticated caller.
 */
export const getCommercialFounderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc(
      "commercial_is_founder_admin",
      { _principal_id: context.userId },
    );
    if (error) throw new Error("Unable to verify StayNas founder workspace access.");
    return { isFounderAdmin: data === true };
  });
