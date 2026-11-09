import { createHash } from "node:crypto";
import type { ConciergeLeadInput } from "./concierge.types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return t ? t.slice(0, max) : null;
}

function validDate(value: string | null): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function captureLead(input: ConciergeLeadInput, propertyId: string) {
  if (!propertyId) throw new Error("Property context is required.");
  if (input.consent !== true) throw new Error("Consent is required before sharing your details.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const token = clean(input.session_token, 80);
  if (!token || !/^cnc_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("A valid concierge session is required.");

  const { data: session, error: sessionError } = await supabaseAdmin
    .from("ai_concierge_sessions")
    .select("id, property_id")
    .eq("session_token", token)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (sessionError || !session || session.property_id !== propertyId) {
    throw new Error("Concierge session is invalid for this property.");
  }

  const email = clean(input.email, 255)?.toLowerCase() ?? null;
  if (email && !EMAIL_RE.test(email)) throw new Error("Please provide a valid email.");
  const name = clean(input.name, 120);
  const phone = clean(input.phone, 40);
  if (!name && !email && !phone) throw new Error("Name, email or phone is required.");

  const start = clean(input.travel_period_start, 10);
  const end = clean(input.travel_period_end, 10);
  if (!validDate(start) || !validDate(end) || (start && end && end <= start)) {
    throw new Error("Please provide a valid travel date range.");
  }
  const adults = input.adults == null ? null : input.adults;
  const children = input.children == null ? null : input.children;
  if (adults !== null && (!Number.isInteger(adults) || adults < 1 || adults > 20)) {
    throw new Error("Adult guest count is invalid.");
  }
  if (children !== null && (!Number.isInteger(children) || children < 0 || children > 20)) {
    throw new Error("Child guest count is invalid.");
  }
  if (adults !== null && children !== null && adults + children > 20) {
    throw new Error("Total guest count is invalid.");
  }

  const interests = Array.isArray(input.interests)
    ? input.interests.filter((value): value is string => typeof value === "string").slice(0, 12).map((value) => value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 40)).filter(Boolean)
    : [];
  const intent_level = start && email ? "high" : email || phone ? "medium" : "low";
  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify({ propertyId, sessionId: session.id, email, phone, name, start, end, adults, children, interests, notes: clean(input.notes, 1000) }))
    .digest("hex");

  const lead = {
    property_id: propertyId,
    session_id: session.id,
    idempotency_key: idempotencyKey,
    consent_at: new Date().toISOString(),
    consent_version: "concierge-lead-v1",
    name,
    email,
    phone,
    country: clean(input.country, 80),
    travel_period_start: start,
    travel_period_end: end,
    party_adults: adults,
    party_children: children,
    interests,
    intent_level,
    notes: clean(input.notes, 1000),
  };

  const { data: inserted, error: insertError } = await (supabaseAdmin as any)
    .from("ai_concierge_leads")
    .upsert(lead, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("id, intent_level, created_at")
    .maybeSingle();
  if (insertError) throw new Error("Could not save your details.");

  const { data, error } = inserted
    ? { data: inserted, error: null }
    : await (supabaseAdmin as any).from("ai_concierge_leads")
        .select("id, intent_level, created_at")
        .eq("idempotency_key", idempotencyKey)
        .eq("property_id", propertyId)
        .single();
  if (error || !data) throw new Error("Could not confirm your saved details.");

  await supabaseAdmin
    .from("ai_concierge_sessions")
    .update({ escalated: true, escalation_channel: "lead" })
    .eq("id", session.id)
    .eq("property_id", propertyId);

  return { ok: true, lead_id: data.id, intent_level: data.intent_level };
}
