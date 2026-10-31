// Server-only helpers used by the public concierge handler.
// Guest memories are explicitly scoped to the active property. Guest identity
// may be global, but preferences and personalization evidence never cross tenants.
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
  propertyId: string;
}): Promise<ConciergeMemoryContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const guestId = params.guestId ?? null;
  const rows: ConciergeMemoryRow[] = [];

  if (guestId) {
    const { data } = await db
      .from("ai_guest_memories")
      .select("*")
      .eq("property_id", params.propertyId)
      .eq("guest_id", guestId)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(20);
    for (const row of (data ?? []) as ConciergeMemoryRow[]) rows.push(row);
  }

  const { data: sessionMems } = await db
    .from("ai_guest_memories")
    .select("*")
    .eq("property_id", params.propertyId)
    .eq("session_id", params.sessionId)
    .eq("status", "approved")
    .limit(20);
  for (const row of (sessionMems ?? []) as ConciergeMemoryRow[]) {
    if (!rows.find((memory) => memory.id === row.id)) rows.push(row);
  }

  let isReturningVisitor = false;
  if (guestId) {
    const { count } = await db
      .from("ai_concierge_sessions")
      .select("id", { count: "exact", head: true })
      .eq("property_id", params.propertyId)
      .eq("guest_id", guestId);
    isReturningVisitor = (count ?? 0) > 1;
  }

  const contextText = rows
    .map((memory) =>
      `- [${memory.memory_type}] ${memory.memory_key}: ${memory.memory_value} (conf ${Number(memory.confidence).toFixed(2)})`,
    )
    .join("\n");

  return {
    memories: rows,
    contextText,
    memoryIds: rows.map((memory) => memory.id),
    guestId,
    isReturningVisitor,
  };
}

// Heuristic suggestions are stored as pending and require staff approval.
// Both reads and writes are constrained by property_id.
export async function suggestMemoriesFromMessage(params: {
  sessionId: string;
  guestId: string | null;
  propertyId: string;
  message: string;
  interests: string[];
  party: { adults?: number | null; children?: number | null };
}): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const suggestions: Array<{
    memory_type: string;
    memory_key: string;
    memory_value: string;
    confidence: number;
  }> = [];
  const message = params.message.toLowerCase();

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
  if (/river[- ]?facing|river view|riverfront/.test(message)) {
    suggestions.push({
      memory_type: "preference",
      memory_key: "preference.room.river_facing",
      memory_value: "Prefers river-facing rooms.",
      confidence: 0.75,
    });
  }
  if (/quiet|peaceful|calm/.test(message)) {
    suggestions.push({
      memory_type: "preference",
      memory_key: "preference.ambience.quiet",
      memory_value: "Prefers a quiet, peaceful stay.",
      confidence: 0.6,
    });
  }
  if (/whatsapp/.test(message)) {
    suggestions.push({
      memory_type: "communication_preference",
      memory_key: "communication.whatsapp",
      memory_value: "Prefers WhatsApp for communication.",
      confidence: 0.7,
    });
  }

  if (suggestions.length === 0) return 0;

  const identityQuery = db
    .from("ai_guest_memories")
    .select("memory_key")
    .eq("property_id", params.propertyId);
  const { data: existingRows } = params.guestId
    ? await identityQuery.eq("guest_id", params.guestId)
    : await identityQuery.eq("session_id", params.sessionId);
  const existing = new Set<string>((existingRows ?? []).map((row: any) => row.memory_key));
  const fresh = suggestions.filter((suggestion) => !existing.has(suggestion.memory_key));
  if (fresh.length === 0) return 0;

  const rows = fresh.map((suggestion) => ({
    ...suggestion,
    property_id: params.propertyId,
    guest_id: params.guestId,
    session_id: params.guestId ? null : params.sessionId,
    source: "ai_suggested",
    status: "pending",
  }));
  const { data: inserted, error } = await db
    .from("ai_guest_memories")
    .insert(rows)
    .select("id");
  if (error) return 0;

  if (inserted?.length) {
    await db.from("ai_memory_events").insert(
      inserted.map((row: any) => ({
        memory_id: row.id,
        event_type: "created",
        payload: { source: "ai_suggested", property_id: params.propertyId },
      })),
    );
  }
  return inserted?.length ?? 0;
}
