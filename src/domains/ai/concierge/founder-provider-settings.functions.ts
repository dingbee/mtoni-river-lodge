import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFounderAiAdmin } from "@/domains/ai/ai.authorization.server";

export const listFounderProviderBindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("ai_provider_property_bindings")
      .select("id,provider,external_account_id,external_endpoint_id,property_id,channel_id,enabled,created_at")
      .order("provider").order("external_endpoint_id");
    if (error) throw new Error(error.message);
    const { data: properties, error: propertyError } = await supabaseAdmin.from("staynas_properties").select("id,name");
    if (propertyError) throw new Error(propertyError.message);
    const names = new Map((properties ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
    return (data ?? []).map((row: any) => ({ ...row, property_name: names.get(row.property_id) ?? "Unknown property" }));
  });

export const saveFounderProviderBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    provider: "meta_cloud_api" | "resend";
    external_account_id: string;
    external_endpoint_id: string;
    property_id: string;
    enabled: boolean;
  }) => {
    if (!input || !["meta_cloud_api", "resend"].includes(input.provider)) throw new Error("Invalid provider.");
    if (!input.external_account_id.trim() || !input.external_endpoint_id.trim() || !input.property_id) throw new Error("Account, endpoint and property are required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: channel, error: channelError } = await supabaseAdmin.from("ai_concierge_channels")
      .select("id").eq("channel", data.provider === "meta_cloud_api" ? "whatsapp" : "email").maybeSingle();
    if (channelError || !channel) throw new Error("The matching global channel is not configured.");
    const { error } = await supabaseAdmin.from("ai_provider_property_bindings").upsert({
      provider: data.provider,
      external_account_id: data.external_account_id.trim(),
      external_endpoint_id: data.external_endpoint_id.trim(),
      property_id: data.property_id,
      channel_id: channel.id,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,external_endpoint_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listFounderProviderProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("staynas_properties").select("id,name").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
