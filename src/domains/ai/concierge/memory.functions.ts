import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConciergeMemoryRow } from "./memory.types";

const MEMORY_TYPES = ["preference", "interest", "travel_style", "communication_preference"] as const;
const MEMORY_STATUS = ["pending", "approved", "rejected", "archived"] as const;
const MANAGER_ROLES = ["owner", "manager", "admin", "reservations"] as const;

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function assertManager(sb: any, userId: string) {
  const { data, error } = await sb.rpc("has_any_role", {
    _user_id: userId,
    _roles: MANAGER_ROLES,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// ---------- list ----------
const listSchema = z
  .object({
    status: z.enum(MEMORY_STATUS).nullable().optional(),
    guestId: z.string().uuid().nullable().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional();

export const listConciergeMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    let q = sb
      .from("ai_guest_memories")
      .select("*, guest:guests(id, full_name, email), session:ai_concierge_sessions(id, session_token, guest_email)")
      .order("created_at", { ascending: false })
      .limit(data?.limit ?? 100);
    if (data?.status) q = q.eq("status", data.status);
    if (data?.guestId) q = q.eq("guest_id", data.guestId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- create (staff) ----------
const createSchema = z.object({
  guestId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  memoryType: z.enum(MEMORY_TYPES),
  memoryKey: z.string().trim().min(1).max(120),
  memoryValue: z.string().trim().min(1).max(400),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(MEMORY_STATUS).optional(),
});

export const createConciergeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const sb: any = context.supabase;
    if (!data.guestId && !data.sessionId) throw new Error("guestId or sessionId required");
    const { data: row, error } = await sb
      .from("ai_guest_memories")
      .insert({
        guest_id: data.guestId ?? null,
        session_id: data.sessionId ?? null,
        memory_type: data.memoryType,
        memory_key: data.memoryKey,
        memory_value: data.memoryValue,
        confidence: data.confidence ?? 0.9,
        source: "staff",
        status: data.status ?? "approved",
        approved_by: data.status === "pending" ? null : context.userId,
        approved_at: data.status === "pending" ? null : new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await sb.from("ai_memory_events").insert({
      memory_id: row.id,
      event_type: "created",
      actor_id: context.userId,
      payload: { source: "staff" },
    });
    return { id: row.id as string };
  });

// ---------- decide ----------
const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "archived"]),
  memoryValue: z.string().trim().min(1).max(400).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const decideConciergeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decideSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const sb: any = context.supabase;
    const patch: any = {
      status: data.decision,
      approved_by: data.decision === "approved" ? context.userId : null,
      approved_at: data.decision === "approved" ? new Date().toISOString() : null,
    };
    if (data.memoryValue) patch.memory_value = data.memoryValue;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await sb.from("ai_guest_memories").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await sb.from("ai_memory_events").insert({
      memory_id: data.id,
      event_type: data.decision === "archived" ? "archived" : data.decision,
      actor_id: context.userId,
      payload: { notes: data.notes ?? null },
    });
    return { ok: true };
  });

// ---------- edit ----------
const editSchema = z.object({
  id: z.string().uuid(),
  memoryType: z.enum(MEMORY_TYPES).optional(),
  memoryKey: z.string().trim().min(1).max(120).optional(),
  memoryValue: z.string().trim().min(1).max(400).optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const editConciergeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => editSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const sb: any = context.supabase;
    const patch: any = {};
    if (data.memoryType) patch.memory_type = data.memoryType;
    if (data.memoryKey) patch.memory_key = data.memoryKey;
    if (data.memoryValue) patch.memory_value = data.memoryValue;
    if (data.confidence !== undefined) patch.confidence = data.confidence;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await sb.from("ai_guest_memories").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await sb
      .from("ai_memory_events")
      .insert({ memory_id: data.id, event_type: "edited", actor_id: context.userId, payload: patch });
    return { ok: true };
  });

// ---------- delete ----------
export const deleteConciergeMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const sb: any = context.supabase;
    // Log first, then delete (cascade removes events after the fact — capture beforehand)
    await sb.from("ai_memory_events").insert({
      memory_id: data.id,
      event_type: "deleted",
      actor_id: context.userId,
      payload: {},
    });
    const { error } = await sb.from("ai_guest_memories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- analytics ----------
export const getMemoryAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: mems }, { data: sessions }, { data: perso }] = await Promise.all([
      sb.from("ai_guest_memories").select("id, memory_type, memory_key, status"),
      sb.from("ai_concierge_sessions").select("id, guest_id, guest_email"),
      sb.from("ai_personalization_events").select("id, event_type, created_at"),
    ]);
    const memories = (mems ?? []) as ConciergeMemoryRow[];
    const approved = memories.filter((m) => m.status === "approved");
    const pending = memories.filter((m) => m.status === "pending");
    const byKey = new Map<string, number>();
    for (const m of approved) byKey.set(m.memory_key, (byKey.get(m.memory_key) ?? 0) + 1);
    const topPreferences = Array.from(byKey.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([memory_key, count]) => ({ memory_key, count }));
    const knownVisitors = (sessions ?? []).filter((s: any) => s.guest_id || s.guest_email).length;
    const total = (sessions ?? []).length;
    return {
      totalMemories: memories.length,
      approved: approved.length,
      pending: pending.length,
      rejected: memories.filter((m) => m.status === "rejected").length,
      topPreferences,
      returningVisitorPct: total > 0 ? Math.round((knownVisitors / total) * 100) : 0,
      personalizationEvents: (perso ?? []).length,
    };
  });