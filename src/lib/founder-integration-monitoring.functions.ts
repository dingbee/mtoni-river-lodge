import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listFounderIntegrationHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleError } = await context.supabase.rpc("current_user_roles");
    if (roleError) throw new Error("Unable to verify Founder Admin access");
    // Do not map property-owner aliases to Founder Admin. This is an explicit global role.
    if (!(roles ?? []).map(String).some((r: string) => ["admin", "founder_admin", "super_admin"].includes(r))) {
      throw new Error("Forbidden: Founder Admin access required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("staynas_property_integrations")
      .select("id,property_id,provider,purpose,enabled,environment,display_name,verification_status,last_verified_at,last_verification_error,updated_at")
      .eq("purpose", "payments").order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error("Unable to load integration health");
    return (data ?? []).map((row: any) => ({
      id: row.id, propertyId: row.property_id, provider: row.provider, purpose: row.purpose,
      enabled: row.enabled, environment: row.environment, displayName: row.display_name ?? row.provider,
      verificationStatus: row.verification_status ?? "not_configured",
      lastVerifiedAt: row.last_verified_at,
      hasRecordedVerificationError: Boolean(row.last_verification_error),
      updatedAt: row.updated_at,
    }));
  });
