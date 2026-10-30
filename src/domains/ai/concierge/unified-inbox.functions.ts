import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function activeProperty(supabase: any, userId: string): Promise<string> {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("No active property selected.");
  const { data: member, error: memberError } = await supabase.from("staynas_property_members")
    .select("property_id").eq("user_id", userId).eq("property_id", propertyId)
    .eq("status", "active").in("role", ["owner", "manager", "admin", "reception"]).maybeSingle();
  if (memberError || !member) throw new Error("Forbidden");
  return String(propertyId);
}

export const listUnifiedInboxConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await activeProperty(context.supabase, context.userId);
    const { data: sessions, error } = await context.supabase.from("ai_concierge_sessions")
      .select("id,channel,guest_name,guest_email,guest_phone,message_count,escalated,last_active_at,created_at")
      .eq("property_id", propertyId).order("last_active_at", { ascending: false }).limit(150);
    if (error) throw new Error(error.message);
    const ids = (sessions ?? []).map((row: { id: string }) => row.id);
    if (!ids.length) return [];
    const { data: messages, error: messageError } = await context.supabase.from("ai_omnichannel_messages")
      .select("session_id,body,subject,status,direction,channel,occurred_at,created_at")
      .eq("property_id", propertyId).in("session_id", ids)
      .order("occurred_at", { ascending: false }).limit(600);
    if (messageError) throw new Error(messageError.message);
    const latest = new Map<string, any>();
    for (const message of messages ?? []) if (!latest.has(message.session_id)) latest.set(message.session_id, message);
    return (sessions ?? []).map((session: any) => ({ ...session, latest_message: latest.get(session.id) ?? null }));
  });

export const getUnifiedInboxTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { session_id: string }) => {
    if (!input?.session_id || !/^[0-9a-f-]{36}$/i.test(input.session_id)) throw new Error("A valid conversation is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const propertyId = await activeProperty(context.supabase, context.userId);
    const { data: session, error: sessionError } = await context.supabase.from("ai_concierge_sessions")
      .select("id,channel,guest_name,guest_email,guest_phone,message_count,escalated,last_active_at,created_at")
      .eq("id", data.session_id).eq("property_id", propertyId).maybeSingle();
    if (sessionError || !session) throw new Error("Conversation not found in the active property.");
    const { data: messages, error } = await context.supabase.from("ai_omnichannel_messages")
      .select("id,channel,direction,actor_type,message_type,subject,body,status,occurred_at,created_at,provider")
      .eq("property_id", propertyId).eq("session_id", data.session_id)
      .order("occurred_at", { ascending: true }).limit(500);
    if (error) throw new Error(error.message);
    const { data: legacy, error: legacyError } = await context.supabase.from("ai_concierge_messages")
      .select("id,role,content,created_at,escalated")
      .eq("session_id", data.session_id).order("created_at", { ascending: true }).limit(500);
    if (legacyError) throw new Error(legacyError.message);
    return { session, messages: messages ?? [], legacyMessages: legacy ?? [] };
  });
