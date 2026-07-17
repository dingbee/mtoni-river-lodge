import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listConciergeSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_concierge_sessions")
      .select("id, session_token, locale, page_context, message_count, escalated, last_active_at, created_at")
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
    const { data: session, error } = await context.supabase
      .from("ai_concierge_sessions")
      .select("*")
      .eq("id", data.session_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) throw new Error("Session not found");
    const { data: messages } = await context.supabase
      .from("ai_concierge_messages")
      .select("id, role, content, citations, confidence, escalated, model, latency_ms, created_at")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: true });
    return { session, messages: messages ?? [] };
  });

export const getConciergeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [sessions, messages, escalations] = await Promise.all([
      context.supabase.from("ai_concierge_sessions").select("id", { count: "exact", head: true }).gte("created_at", since),
      context.supabase.from("ai_concierge_messages").select("id", { count: "exact", head: true }).gte("created_at", since),
      context.supabase.from("ai_concierge_sessions").select("id", { count: "exact", head: true }).gte("created_at", since).eq("escalated", true),
    ]);
    return {
      sessions_30d: sessions.count ?? 0,
      messages_30d: messages.count ?? 0,
      escalations_30d: escalations.count ?? 0,
    };
  });