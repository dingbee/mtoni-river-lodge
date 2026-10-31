import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFounderAiAdmin } from "@/domains/ai/ai.authorization.server";

type Provider = "meta_cloud_api" | "resend";

async function founderAdmin(context: any) {
  await assertFounderAiAdmin(context.supabase, context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const listFounderProviderBindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await founderAdmin(context);
    const { data, error } = await admin
      .from("ai_provider_property_bindings")
      .select("id,provider,external_account_id,external_endpoint_id,property_id,channel_id,enabled,staynas_properties(name)")
      .order("provider")
      .order("external_account_id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({
      ...row,
      property_name: row.staynas_properties?.name ?? "Unknown property",
      staynas_properties: undefined,
    }));
  });

export const listFounderProviderProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await founderAdmin(context);
    const { data, error } = await admin
      .from("staynas_properties")
      .select("id,name,status")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveFounderProviderBinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    provider: Provider;
    external_account_id: string;
    external_endpoint_id: string;
    property_id: string;
    enabled: boolean;
  }) => {
    if (!input || !["meta_cloud_api", "resend"].includes(input.provider)) {
      throw new Error("Unsupported provider.");
    }
    const account = String(input.external_account_id ?? "").trim();
    const endpoint = String(input.external_endpoint_id ?? "").trim();
    const propertyId = String(input.property_id ?? "").trim();
    if (!account || !endpoint || !propertyId) throw new Error("Provider account, endpoint and property are required.");
    if (account.length > 255 || endpoint.length > 320) throw new Error("Provider identifiers exceed the allowed length.");
    return { ...input, external_account_id: account, external_endpoint_id: endpoint, property_id: propertyId };
  })
  .handler(async ({ data, context }) => {
    const admin = await founderAdmin(context);
    const [{ data: property, error: propertyError }, { data: channel, error: channelError }] = await Promise.all([
      admin.from("staynas_properties").select("id").eq("id", data.property_id).maybeSingle(),
      admin.from("ai_concierge_channels").select("id").eq("channel", data.provider === "meta_cloud_api" ? "whatsapp" : "email").maybeSingle(),
    ]);
    if (propertyError || !property) throw new Error("Selected property does not exist.");
    if (channelError || !channel) throw new Error("The matching concierge channel is not configured.");
    const { error } = await admin.from("ai_provider_property_bindings").upsert({
      provider: data.provider,
      external_account_id: data.external_account_id,
      external_endpoint_id: data.external_endpoint_id,
      property_id: data.property_id,
      channel_id: channel.id,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,external_endpoint_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
