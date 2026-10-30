import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFounderAiAdmin } from "@/domains/ai/ai.authorization.server";
import type {
  ChannelRow,
  CommunicationDraftRow,
  CommunicationDraftStatus,
  CommunicationDraftType,
  ConciergeChannel,
  EscalationReason,
  EscalationRow,
  EscalationStatus,
} from "./omnichannel.types";

const CHANNELS: ConciergeChannel[] = ["web", "whatsapp", "email"];
const isChannel = (v: unknown): v is ConciergeChannel =>
  typeof v === "string" && (CHANNELS as string[]).includes(v);

const STAFF_ROLES = ["owner", "manager", "admin", "reception"] as const;
const MANAGER_ROLES = ["owner", "manager", "admin"] as const;

async function requirePropertyScope(
  supabase: any,
  userId: string,
  allowedRoles: readonly string[] = STAFF_ROLES,
): Promise<string> {
  const { data: propertyId, error: contextError } = await supabase.rpc(
    "staynas_active_property_id",
    { _uid: userId },
  );
  if (contextError || !propertyId) throw new Error("No active property selected.");

  const { data: membership, error: membershipError } = await supabase
    .from("staynas_property_members")
    .select("property_id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .in("role", [...allowedRoles])
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Forbidden");
  return String(propertyId);
}

async function requireSessionInProperty(
  supabase: any,
  sessionId: string,
  propertyId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("ai_concierge_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error || !data) throw new Error("Conversation not found in the active property.");
}

async function propertySessionIds(supabase: any, propertyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("ai_concierge_sessions")
    .select("id")
    .eq("property_id", propertyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: { id: string }) => row.id);
}

// ── Channels ────────────────────────────────────────────────────────────────
export const listConciergeChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("ai_concierge_channels")
      .select("*")
      .order("channel");
    if (error) throw new Error(error.message);
    return (data ?? []) as ChannelRow[];
  });

export const updateConciergeChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status?: ChannelRow["status"];
      inbound_enabled?: boolean;
      outbound_enabled?: boolean;
      requires_approval?: boolean;
      notes?: string | null;
    }) => {
      if (!input?.id) throw new Error("id required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertFounderAiAdmin(context.supabase, context.userId);
    const patch: Record<string, unknown> = {};
    for (const k of [
      "status",
      "inbound_enabled",
      "outbound_enabled",
      "requires_approval",
      "notes",
    ] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    const { error } = await context.supabase
      .from("ai_concierge_channels")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Unified conversations timeline ──────────────────────────────────────────
export const listConciergeConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      channel?: ConciergeChannel | "all";
      escalated?: boolean;
      guest_query?: string | null;
      limit?: number;
    }) => input ?? {},
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    let q = context.supabase
      .from("ai_concierge_sessions")
      .select(
        "id, channel, session_token, locale, page_context, guest_id, guest_name, guest_email, message_count, escalated, identity_confidence, last_active_at, created_at",
      )
      .eq("property_id", propertyId)
      .order("last_active_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit ?? 100, 1), 300));
    if (data.channel && data.channel !== "all") q = q.eq("channel", data.channel);
    if (data.escalated) q = q.eq("escalated", true);
    if (data.guest_query) {
      const s = data.guest_query.trim();
      if (s) q = q.or(`guest_name.ilike.%${s}%,guest_email.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ── Communication drafts ────────────────────────────────────────────────────
function draftTemplate(type: CommunicationDraftType, ctx: {
  guest_name?: string | null;
  room_slug?: string | null;
  check_in?: string | null;
}): { subject: string; body: string; reasoning: string } {
  const name = ctx.guest_name?.split(/\s+/)[0] ?? "there";
  const roomName = ctx.room_slug ? "room " + ctx.room_slug : "your room";
  switch (type) {
    case "welcome":
      return {
        subject: `Karibu to StayNas, ${name}`,
        body: `Hi ${name},\n\nA warm karibu from the property team. We're delighted you'll be staying with us in ${roomName}${ctx.check_in ? ` from ${ctx.check_in}` : ""}. If there's anything we can prepare in advance — dietary needs, airport transfer, or a special occasion — just reply to this message.\n\nWith warm regards,\nThe StayNas team`,
        reasoning: "Warm, personal welcome referencing the guest's booked room.",
      };
    case "pre_arrival":
      return {
        subject: `Getting ready for your StayNas stay`,
        body: `Hi ${name},\n\nYour stay is almost here. A few notes to help you settle in easily:\n• Check-in from 14:00; late arrivals welcome — please share your flight details if we can help with the transfer.\n• Dinner is served à la carte at the riverside restaurant; do let us know of any dietary needs.\n• Guided experiences (river walk, canoe, bonfire dining) can be reserved in advance.\n\nSafari njema,\nThe StayNas team`,
        reasoning: "Standard pre-arrival brief covering check-in, dining and experiences.",
      };
    case "activity_intro":
      return {
        subject: `Ideas for your days at the property`,
        body: `Hi ${name},\n\nBased on what you've mentioned, you may enjoy a guided river walk in the golden hour and a candlelit dinner by the water. If you'd like to add a Lake Duluti canoe morning or an early Arusha coffee farm tour, we can pre-arrange transport.\n\nJust let us know and we'll take care of it.\n\nThe StayNas team`,
        reasoning: "Suggests signature experiences aligned to typical guest interests.",
      };
    case "transfer_info":
      return {
        subject: `Airport transfer for your StayNas stay`,
        body: `Hi ${name},\n\nWe can arrange a private transfer from Kilimanjaro International (JRO) or Arusha Airport (ARK). Share your flight number and arrival time and we'll confirm the driver and rate directly.\n\nThe StayNas team`,
        reasoning: "Standard transfer prompt asking for flight details.",
      };
    case "follow_up":
      return {
        subject: `Thank you for staying with us`,
        body: `Hi ${name},\n\nAsante sana for choosing the property. It was a pleasure hosting you. If you enjoyed your stay, a short review would mean the world to our small team — and we'd love to welcome you back on your next journey to Tanzania.\n\nWith warm regards,\nThe StayNas team`,
        reasoning: "Post-stay thank-you with a soft review nudge.",
      };
    case "custom":
    default:
      return {
        subject: `A note from StayNas`,
        body: `Hi ${name},\n\n[Draft body — please edit]\n\nThe StayNas team`,
        reasoning: "Blank template for staff-authored messages.",
      };
  }
}

export const createCommunicationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      channel: ConciergeChannel;
      draft_type: CommunicationDraftType;
      session_id?: string | null;
      guest_id?: string | null;
      booking_id?: string | null;
      guest_name?: string | null;
      room_slug?: string | null;
      check_in?: string | null;
      subject?: string | null;
      body?: string | null;
      notes?: string | null;
    }) => {
      if (!isChannel(input?.channel)) throw new Error("invalid channel");
      if (!input?.draft_type) throw new Error("draft_type required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    if (!data.session_id) throw new Error("A conversation from the active property is required.");
    await requireSessionInProperty(context.supabase, data.session_id, propertyId);
    const tpl = draftTemplate(data.draft_type, {
      guest_name: data.guest_name ?? null,
      room_slug: data.room_slug ?? null,
      check_in: data.check_in ?? null,
    });
    const { data: row, error } = await context.supabase
      .from("ai_communication_drafts")
      .insert({
        channel: data.channel,
        draft_type: data.draft_type,
        session_id: data.session_id ?? null,
        guest_id: data.guest_id ?? null,
        booking_id: data.booking_id ?? null,
        subject: data.subject ?? tpl.subject,
        body: data.body ?? tpl.body,
        reasoning: tpl.reasoning,
        supporting_context: {
          guest_name: data.guest_name ?? null,
          room_slug: data.room_slug ?? null,
          check_in: data.check_in ?? null,
        },
        status: "pending",
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const listCommunicationDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: CommunicationDraftStatus | "all" }) => input ?? {})
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const sessionIds = await propertySessionIds(context.supabase, propertyId);
    if (sessionIds.length === 0) return [];
    let q = context.supabase
      .from("ai_communication_drafts")
      .select("*")
      .in("session_id", sessionIds)
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as CommunicationDraftRow[];
  });

export const updateCommunicationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status?: CommunicationDraftStatus;
      subject?: string | null;
      body?: string;
      notes?: string | null;
    }) => {
      if (!input?.id) throw new Error("id required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const sessionIds = await propertySessionIds(context.supabase, propertyId);
    if (sessionIds.length === 0) throw new Error("Draft not found in the active property.");
    const patch: Record<string, unknown> = {};
    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.body !== undefined) patch.body = data.body;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status) {
      patch.status = data.status;
      if (data.status === "approved" || data.status === "edited") {
        patch.approved_by = context.userId;
        patch.approved_at = new Date().toISOString();
      }
    }
    const { data: updated, error } = await context.supabase
      .from("ai_communication_drafts")
      .update(patch as never)
      .eq("id", data.id)
      .in("session_id", sessionIds)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Draft not found in the active property.");
    return { ok: true };
  });

// ── Escalations ─────────────────────────────────────────────────────────────
export const listEscalations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: EscalationStatus | "all" }) => input ?? {})
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const sessionIds = await propertySessionIds(context.supabase, propertyId);
    if (sessionIds.length === 0) return [];
    let q = context.supabase
      .from("ai_escalations")
      .select("*")
      .in("session_id", sessionIds)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as EscalationRow[];
  });

export const createEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      session_id: string;
      channel: ConciergeChannel;
      reason: EscalationReason;
      summary?: string | null;
      ai_confidence?: number | null;
      priority?: 1 | 2 | 3;
    }) => {
      if (!input?.session_id) throw new Error("session_id required");
      if (!isChannel(input.channel)) throw new Error("invalid channel");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    await requireSessionInProperty(context.supabase, data.session_id, propertyId);
    const { data: row, error } = await context.supabase
      .from("ai_escalations")
      .insert({
        session_id: data.session_id,
        channel: data.channel,
        reason: data.reason,
        summary: data.summary ?? null,
        ai_confidence: data.ai_confidence ?? null,
        priority: data.priority ?? 2,
        status: "open",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const updateEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      status?: EscalationStatus;
      assigned_to?: string | null;
      resolution_notes?: string | null;
    }) => {
      if (!input?.id) throw new Error("id required");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
    const sessionIds = await propertySessionIds(context.supabase, propertyId);
    if (sessionIds.length === 0) throw new Error("Escalation not found in the active property.");
    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "resolved" || data.status === "dismissed") {
        patch.resolved_at = new Date().toISOString();
      }
    }
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (data.resolution_notes !== undefined) patch.resolution_notes = data.resolution_notes;
    const { data: updated, error } = await context.supabase
      .from("ai_escalations")
      .update(patch as never)
      .eq("id", data.id)
      .in("session_id", sessionIds)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Escalation not found in the active property.");
    return { ok: true };
  });

// ── Analytics ───────────────────────────────────────────────────────────────
export const getOmnichannelAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: sessions, error: sessionError } = await context.supabase
      .from("ai_concierge_sessions")
      .select("id, channel")
      .eq("property_id", propertyId)
      .gte("created_at", since);
    if (sessionError) throw new Error(sessionError.message);
    const sessionIds = (sessions ?? []).map((row: { id: string }) => row.id);
    if (sessionIds.length === 0) {
      return { sessions_30d: { web: 0, whatsapp: 0, email: 0 }, escalations_open: 0, drafts_pending: 0 };
    }
    const [escOpen, drafts] = await Promise.all([
      context.supabase
        .from("ai_escalations")
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds)
        .in("status", ["open", "assigned", "in_progress"]),
      context.supabase
        .from("ai_communication_drafts")
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds)
        .eq("status", "pending"),
    ]);
    if (escOpen.error) throw new Error(escOpen.error.message);
    if (drafts.error) throw new Error(drafts.error.message);
    return {
      sessions_30d: {
        web: sessions.filter((row: any) => row.channel === "web").length,
        whatsapp: sessions.filter((row: any) => row.channel === "whatsapp").length,
        email: sessions.filter((row: any) => row.channel === "email").length,
      },
      escalations_open: escOpen.count ?? 0,
      drafts_pending: drafts.count ?? 0,
    };
  });