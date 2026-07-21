// Server-only helpers used by the public concierge handler.
// Loads approved memories for a given session or guest identity and
// returns a compact context string plus the memory ids that were applied
// (for personalization event logging). Uses supabaseAdmin because the
// concierge is a public/anon surface.
import type { ConciergeMemoryRow } from "./memory.types";

export interface ConciergeMemoryContext {
  memories: ConciergeMemoryRow[];
  contextText: string;
  memoryIds: string[];
  guestId: string | null;
  isReturningVisitor: boolean;
}

export async function loadConciergeMemoryContext(params: {
  sessionId: string;
  guestId: string | null;
  guestEmail: string | null;
}): Promise<ConciergeMemoryContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let guestId = params.guestId ?? null;

  // Resolve guest by voluntarily-provided email if we don't have one yet.
  if (!guestId && params.guestEmail) {
    const email = params.guestEmail.trim().toLowerCase();
    if (email) {
      const { data: g } = await supabaseAdmin
        .from("guests")
        .select("id")
        .eq("email", email)
        .eq("is_deleted", false)
        .maybeSingle();
      if (g?.id) guestId = g.id;
    }
  }

  const rows: ConciergeMemoryRow[] = [];
  if (guestId) {
    const { data } = await supabaseAdmin
      .from("ai_guest_memories")
      .select("*")
      .eq("guest_id", guestId)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(20);
    for (const r of (data ?? []) as ConciergeMemoryRow[]) rows.push(r);
  }
  // Session-scoped approved memories (anonymous returning session)
  const { data: sessionMems } = await supabaseAdmin
    .from("ai_guest_memories")
    .select("*")
    .eq("session_id", params.sessionId)
    .eq("status", "approved")
    .limit(20);
  for (const r of (sessionMems ?? []) as ConciergeMemoryRow[]) {
    if (!rows.find((m) => m.id === r.id)) rows.push(r);
  }

  // Returning visitor: linked guest OR prior sessions from same email
  let isReturning = false;
  if (guestId) {
    const { count } = await supabaseAdmin
      .from("ai_concierge_sessions")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", guestId);
    isReturning = (count ?? 0) > 1;
  }

  const contextText = rows.length
    ? rows
        .map(
          (m) =>
            `- [${m.memory_type}] ${m.memory_key}: ${m.memory_value} (conf ${Number(m.confidence).toFixed(2)})`,
        )
        .join("\n")
    : "";

  return {
    memories: rows,
    contextText,
    memoryIds: rows.map((r) => r.id),
    guestId,
    isReturningVisitor: isReturning,
  };
}

// Heuristic suggestion of new memories from the guest's message + intent signals.
// Always inserted with status='pending'. Staff must approve.
export async function suggestMemoriesFromMessage(params: {
  sessionId: string;
  guestId: string | null;
  message: string;
  interests: string[];
  party: { adults?: number | null; children?: number | null };
}): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const suggestions: Array<{
    memory_type: string;
    memory_key: string;
    memory_value: string;
    confidence: number;
  }> = [];
  const text = params.message.toLowerCase();

  for (const tag of params.interests ?? []) {
    if (!tag) continue;
    suggestions.push({
      memory_type: "interest",
      memory_key: `interest.${tag}`,
      memory_value: `Interested in ${tag}.`,
      confidence: 0.65,
    });
  }
  if ((params.party.children ?? 0) > 0) {
    suggestions.push({
      memory_type: "travel_style",
      memory_key: "travel_style.family",
      memory_value: "Travels with family.",
      confidence: 0.7,
    });
  }
  if (/river[- ]?facing|river view|riverfront/.test(text)) {
    suggestions.push({
      memory_type: "preference",
      memory_key: "preference.room.river_facing",
      memory_value: "Prefers river-facing rooms.",
      confidence: 0.75,
    });
  }
  if (/quiet|peaceful|calm/.test(text)) {
    suggestions.push({
      memory_type: "preference",
      memory_key: "preference.ambience.quiet",
      memory_value: "Prefers a quiet, peaceful stay.",
      confidence: 0.6,
    });
  }
  if (/whatsapp/.test(text)) {
    suggestions.push({
      memory_type: "communication_preference",
      memory_key: "communication.whatsapp",
      memory_value: "Prefers WhatsApp for communication.",
      confidence: 0.7,
    });
  }

  if (suggestions.length === 0) return 0;

  // Dedupe against existing rows for this guest/session
  let existing = new Set<string>();
  if (params.guestId) {
    const { data } = await supabaseAdmin
      .from("ai_guest_memories")
      .select("memory_key")
      .eq("guest_id", params.guestId);
    for (const r of data ?? []) existing.add((r as any).memory_key);
  } else {
    const { data } = await supabaseAdmin
      .from("ai_guest_memories")
      .select("memory_key")
      .eq("session_id", params.sessionId);
    for (const r of data ?? []) existing.add((r as any).memory_key);
  }
  const fresh = suggestions.filter((s) => !existing.has(s.memory_key));
  if (fresh.length === 0) return 0;

  const rows = fresh.map((s) => ({
    ...s,
    guest_id: params.guestId,
    session_id: params.guestId ? null : params.sessionId,
    source: "ai_suggested",
    status: "pending",
  }));
  const { data: inserted, error } = await supabaseAdmin
    .from("ai_guest_memories")
    .insert(rows)
    .select("id");
  if (error) return 0;
  if (inserted?.length) {
    await supabaseAdmin.from("ai_memory_events").insert(
      inserted.map((r: Record<string, unknown>) => ({
        memory_id: r.id,
        event_type: "created",
        payload: { source: "ai_suggested" },
      })),
    );
  }
  return inserted?.length ?? 0;
}