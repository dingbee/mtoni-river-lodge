/** Public tracking helpers for the concierge widget. Server-side only. */

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

async function resolveSessionId(token: string | null) {
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ai_concierge_sessions")
    .select("id")
    .eq("session_token", token)
    .maybeSingle();
  return data?.id ?? null;
}

export async function recordAttribution(input: {
  session_token: string | null;
  conversion_type?: string;
  metadata?: Record<string, unknown>;
}) {
  const token = clean(input.session_token, 80);
  const sessionId = await resolveSessionId(token);
  if (!sessionId) return { ok: false, error: "session_not_found" as const };

  const allowed = new Set(["booking_click", "lead", "assisted_booking", "direct_booking"]);
  const type = allowed.has(input.conversion_type ?? "") ? (input.conversion_type as string) : "booking_click";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ai_concierge_attributions").insert({
    session_id: sessionId,
    conversion_type: type,
    metadata: (input.metadata ?? {}) as any,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function recordFeedback(input: {
  session_token: string | null;
  rating: string;
  comment?: string | null;
  message_id?: string | null;
}) {
  const token = clean(input.session_token, 80);
  const sessionId = await resolveSessionId(token);
  if (!sessionId) return { ok: false, error: "session_not_found" as const };

  if (input.rating !== "helpful" && input.rating !== "not_helpful") {
    throw new Error("rating must be 'helpful' or 'not_helpful'");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ai_concierge_feedback").insert({
    session_id: sessionId,
    rating: input.rating,
    comment: clean(input.comment, 1000),
    message_id: clean(input.message_id, 60),
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}