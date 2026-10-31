import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requirePropertyScope(sb: any, userId: string): Promise<string> {
  const { data: propertyId, error: contextError } = await sb.rpc("staynas_active_property_id", { _uid: userId });
  if (contextError || !propertyId) throw new Error("No active property selected.");
  const { data: membership, error: membershipError } = await sb
    .from("staynas_property_members")
    .select("property_id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .in("role", ["owner", "manager", "admin", "reception", "marketing"])
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Forbidden");
  return String(propertyId);
}

async function requireLeadInProperty(sb: any, leadId: string, propertyId: string): Promise<void> {
  const { data, error } = await sb.from("ai_concierge_leads").select("id").eq("id", leadId).eq("property_id", propertyId).maybeSingle();
  if (error || !data) throw new Error("Lead not found in the active property.");
}

async function propertySessionIds(sb: any, propertyId: string, since?: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = sb.from("ai_concierge_sessions").select("id").eq("property_id", propertyId);
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((row: { id: string }) => row.id);
    ids.push(...page);
    if (page.length < pageSize) break;
  }
  return ids;
}

export const listConciergeSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ai_concierge_sessions")
      .select("id, locale, page_context, message_count, escalated, last_active_at, created_at")
      .eq("property_id", propertyId)
      .order("last_active_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getConciergeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { session_id: string }) => {
    if (!input?.session_id) throw new Error("session_id required");
    return { session_id: input.session_id };
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const { data: session, error } = await context.supabase
      .from("ai_concierge_sessions")
      .select("id, property_id, locale, page_context, guest_name, guest_email, guest_phone, message_count, escalated, last_active_at, created_at")
      .eq("id", data.session_id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) throw new Error("Session not found");
    const { data: messages, error: messagesError } = await context.supabase
      .from("ai_concierge_messages")
      .select("id, role, content, citations, confidence, escalated, model, latency_ms, created_at")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: true });
    if (messagesError) throw new Error(messagesError.message);
    return { session, messages: messages ?? [] };
  });

export const getConciergeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const sessionIds = await propertySessionIds(context.supabase, propertyId, since);
    if (sessionIds.length === 0) return { sessions_30d: 0, messages_30d: 0, escalations_30d: 0 };
    const [messages, escalations] = await Promise.all([
      context.supabase.from("ai_concierge_messages").select("id", { count: "exact", head: true }).in("session_id", sessionIds).gte("created_at", since),
      context.supabase.from("ai_concierge_sessions").select("id", { count: "exact", head: true }).in("id", sessionIds).eq("escalated", true),
    ]);
    if (messages.error) throw new Error(messages.error.message);
    if (escalations.error) throw new Error(escalations.error.message);
    return {
      sessions_30d: sessionIds.length,
      messages_30d: messages.count ?? 0,
      escalations_30d: escalations.count ?? 0,
    };
  });

export const listConciergeLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ai_concierge_leads")
      .select("id, session_id, name, email, phone, country, travel_period_start, travel_period_end, party_adults, party_children, interests, intent_level, status, notes, created_at, updated_at")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateConciergeLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status?: string; notes?: string | null }) => {
    if (!input?.id) throw new Error("id required");
    const allowed = new Set(["new", "contacted", "qualified", "converted", "closed"]);
    if (input.status && !allowed.has(input.status)) throw new Error("invalid status");
    return input;
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    await requireLeadInProperty(context.supabase, data.id, propertyId);
    const patch: { status?: string; notes?: string | null } = {};
    if (data.status) patch.status = data.status;
    if (typeof data.notes !== "undefined") patch.notes = data.notes;
    if (Object.keys(patch).length === 0) throw new Error("No lead changes supplied.");
    const { error } = await context.supabase.from("ai_concierge_leads").update(patch).eq("id", data.id).eq("property_id", propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
