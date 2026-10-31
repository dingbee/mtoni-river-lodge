import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const integrationSchema = z.object({
  provider: z.enum(["pesapal"]),
  environment: z.enum(["sandbox", "live"]),
  displayName: z.string().trim().min(1).max(80),
  consumerKey: z.string().trim().min(1).max(500),
  consumerSecret: z.string().min(1).max(2000),
  ipnId: z.string().trim().max(200).optional().default(""),
  supportedCurrencies: z.array(z.string().regex(/^[A-Z]{3}$/)).max(10).default(["TZS"]),
  enabled: z.boolean().default(false),
});

async function requirePropertyAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("No authorized property selected");
  const { data: member, error: memberError } = await supabase
    .from("staynas_property_members").select("role,status")
    .eq("property_id", data).eq("user_id", userId).maybeSingle();
  if (memberError || !member || member.status !== "active" || !["owner", "manager", "admin"].includes(String(member.role))) {
    throw new Error("Forbidden: property owner or manager access is required");
  }
  return String(data);
}

export const listPropertyPaymentIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyAdmin(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any).from("staynas_property_integrations")
      .select("id,property_id,provider,purpose,enabled,environment,credential_reference,public_config,display_name,supported_methods,supported_currencies,verification_status,last_verified_at,last_verification_error,updated_at")
      .eq("property_id", propertyId).eq("purpose", "payments").order("updated_at", { ascending: false });
    if (error) throw new Error("Unable to load property payment integrations");
    return (data ?? []).map((row: any) => {
      const { credential_reference, last_verification_error, ...safe } = row;
      return {
        ...safe,
        credentials_configured: Boolean(credential_reference),
        public_config: safe.public_config ?? {},
        last_verification_error: last_verification_error ? "A verification error was recorded; inspect server-side diagnostics." : null,
      };
    });
  });

export const savePropertyPaymentIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => integrationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyAdmin(context.supabase, context.userId);
    const { data: existing, error: lookupError } = await (context.supabase as any).from("staynas_property_integrations")
      .select("id").eq("property_id", propertyId).eq("purpose", "payments").eq("provider", data.provider).eq("environment", data.environment).maybeSingle();
    if (lookupError) throw new Error("Unable to inspect existing property integration");
    // The authenticated tenant context is checked before any service-role Vault access.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const secretName = `staynas-payment-${propertyId}-${data.provider}-${crypto.randomUUID()}`;
    const secretPayload = JSON.stringify({
      consumer_key: data.consumerKey,
      consumer_secret: data.consumerSecret,
      ...(data.ipnId ? { ipn_id: data.ipnId } : {}),
    });
    const { data: createdSecret, error: secretError } = await (supabaseAdmin as any).rpc("staynas_create_payment_vault_secret", {
      p_name: secretName, p_secret: secretPayload, p_property_id: propertyId, p_user_id: context.userId,
    });
    if (secretError || !createdSecret) throw new Error("Secure credential storage is unavailable; integration was not saved");
    const secretReference = `vault://${createdSecret}`;
    const payload = {
      property_id: propertyId, provider: data.provider, purpose: "payments", environment: data.environment,
      display_name: data.displayName, credential_reference: secretReference,
      public_config: {}, supported_methods: ["card"], supported_currencies: data.supportedCurrencies,
      enabled: false, verification_status: "pending", created_by: context.userId, updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const q = existing?.id
      ? (context.supabase as any).from("staynas_property_integrations").update(payload).eq("id", existing.id).eq("property_id", propertyId).select("id").single()
      : (context.supabase as any).from("staynas_property_integrations").insert(payload).select("id").single();
    const { data: saved, error } = await q;
    if (error || !saved) throw new Error("Secure credentials were stored, but integration metadata could not be saved. Contact support to reconcile the orphaned secret.");
    return { id: saved.id, credentialsConfigured: true, enabled: false, verificationStatus: "pending" as const };
  });
