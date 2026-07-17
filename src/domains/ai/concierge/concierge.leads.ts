import type { ConciergeLeadInput } from "./concierge.types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function captureLead(input: ConciergeLeadInput) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let sessionId: string | null = null;
  const token = clean(input.session_token, 80);
  if (token) {
    const { data } = await supabaseAdmin
      .from("ai_concierge_sessions")
      .select("id")
      .eq("session_token", token)
      .maybeSingle();
    sessionId = data?.id ?? null;
  }

  const email = clean(input.email, 255);
  if (email && !EMAIL_RE.test(email)) throw new Error("Please provide a valid email.");
  const name = clean(input.name, 120);
  if (!name && !email) throw new Error("Name or email is required.");

  const start = clean(input.travel_period_start, 10);
  const end = clean(input.travel_period_end, 10);
  const adults = typeof input.adults === "number" ? Math.max(0, Math.min(20, input.adults)) : null;
  const children = typeof input.children === "number" ? Math.max(0, Math.min(20, input.children)) : null;

  const interests = Array.isArray(input.interests)
    ? input.interests.filter((s): s is string => typeof s === "string").slice(0, 12).map((s) => s.slice(0, 40))
    : [];

  // Basic intent level heuristic
  const intent_level = start && email ? "high" : email ? "medium" : "low";

  const { data, error } = await supabaseAdmin
    .from("ai_concierge_leads")
    .insert({
      session_id: sessionId,
      name,
      email,
      phone: clean(input.phone, 40),
      country: clean(input.country, 80),
      travel_period_start: start,
      travel_period_end: end,
      party_adults: adults,
      party_children: children,
      interests,
      intent_level,
      notes: clean(input.notes, 1000),
    })
    .select("id, intent_level, created_at")
    .single();
  if (error) throw new Error(error.message);

  if (sessionId) {
    await supabaseAdmin
      .from("ai_concierge_sessions")
      .update({ escalated: true, escalation_channel: "lead" })
      .eq("id", sessionId);
  }

  return { ok: true, lead_id: data.id, intent_level: data.intent_level };
}