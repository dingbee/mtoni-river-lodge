import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type PropertyChannelSettingsInsert = Database["public"]["Tables"]["ai_property_channel_settings"]["Insert"];

const channels = ["web", "whatsapp", "email"] as const;
type Channel = typeof channels[number];

async function requireTenantAdmin(supabase: any, userId: string): Promise<string> {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("No active property selected.");
  const { data: member, error: memberError } = await supabase.from("staynas_property_members")
    .select("property_id").eq("user_id", userId).eq("property_id", propertyId)
    .eq("status", "active").in("role", ["owner", "manager", "admin"]).maybeSingle();
  if (memberError || !member) throw new Error("Tenant administrator access required.");
  return String(propertyId);
}

export const listPropertyChannelSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requireTenantAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("ai_property_channel_settings")
      .select("id,channel,enabled,inbound_enabled,outbound_enabled,sender_display_name,sender_email,sender_phone_label,approved_template_names,require_human_approval,service_consent_required,marketing_consent_required,staff_handoff_enabled")
      .eq("property_id", propertyId).order("channel");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updatePropertyChannelSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    channel: Channel;
    enabled?: boolean;
    inbound_enabled?: boolean;
    outbound_enabled?: boolean;
    sender_display_name?: string | null;
    sender_email?: string | null;
    sender_phone_label?: string | null;
    approved_template_names?: string[];
    require_human_approval?: boolean;
    service_consent_required?: boolean;
    marketing_consent_required?: boolean;
    staff_handoff_enabled?: boolean;
  }) => {
    if (!input || !channels.includes(input.channel)) throw new Error("Invalid channel.");
    if (input.sender_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.sender_email)) throw new Error("Invalid sender email.");
    if (input.approved_template_names && (input.approved_template_names.length > 50 || input.approved_template_names.some(v => !/^[a-z0-9_]{1,512}$/.test(v)))) throw new Error("Invalid approved template list.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requireTenantAdmin(context.supabase, context.userId);
    const patch: PropertyChannelSettingsInsert = {
      property_id: propertyId,
      channel: data.channel,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
      ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
      ...(data.inbound_enabled === undefined ? {} : { inbound_enabled: data.inbound_enabled }),
      ...(data.outbound_enabled === undefined ? {} : { outbound_enabled: data.outbound_enabled }),
      ...(data.sender_display_name === undefined ? {} : { sender_display_name: data.sender_display_name }),
      ...(data.sender_email === undefined ? {} : { sender_email: data.sender_email }),
      ...(data.sender_phone_label === undefined ? {} : { sender_phone_label: data.sender_phone_label }),
      ...(data.approved_template_names === undefined ? {} : { approved_template_names: data.approved_template_names }),
      ...(data.require_human_approval === undefined ? {} : { require_human_approval: data.require_human_approval }),
      ...(data.service_consent_required === undefined ? {} : { service_consent_required: data.service_consent_required }),
      ...(data.marketing_consent_required === undefined ? {} : { marketing_consent_required: data.marketing_consent_required }),
      ...(data.staff_handoff_enabled === undefined ? {} : { staff_handoff_enabled: data.staff_handoff_enabled }),
    };
    const { error } = await context.supabase.from("ai_property_channel_settings").upsert(patch as never, { onConflict: "property_id,channel" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
