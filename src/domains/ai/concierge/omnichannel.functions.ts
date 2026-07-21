import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROOMS } from "@/lib/rooms";
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

function requireManager(userId: string, roles: string[]) {
  return roles.some((r) =>
    ["owner", "manager", "reservations"].includes(r),
  ) || !!userId;
}
void requireManager;

// ── Channels ────────────────────────────────────────────────────────────────
export const listConciergeChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
    let q = context.supabase
      .from("ai_concierge_sessions")
      .select(
        "id, channel, session_token, locale, page_context, guest_id, guest_name, guest_email, message_count, escalated, identity_confidence, last_active_at, created_at",
      )
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
  const room = ROOMS.find((r) => r.slug === ctx.room_slug);
  const roomName = room?.name ?? "your room";
  switch (type) {
    case "welcome":
      return {
        subject: `Karibu to Mtoni River Lodge, ${name}`,
        body: `Hi ${name},\n\nA warm karibu from all of us at Mtoni River Lodge. We're delighted you'll be staying with us in ${roomName}${ctx.check_in ? ` from ${ctx.check_in}` : ""}. If there's anything we can prepare in advance — dietary needs, airport transfer, or a special occasion — just reply to this message.\n\nWith warm regards,\nThe Mtoni team`,
        reasoning: "Warm, personal welcome referencing the guest's booked room.",
      };
    case "pre_arrival":
      return {
        subject: `Getting ready for your Mtoni stay`,
        body: `Hi ${name},\n\nYour stay is almost here. A few notes to help you settle in easily:\n• Check-in from 14:00; late arrivals welcome — please share your flight details if we can help with the transfer.\n• Dinner is served à la carte at the riverside restaurant; do let us know of any dietary needs.\n• Guided experiences (river walk, canoe, bonfire dining) can be reserved in advance.\n\nSafari njema,\nThe Mtoni team`,
        reasoning: "Standard pre-arrival brief covering check-in, dining and experiences.",
      };
    case "activity_intro":
      return {
        subject: `Ideas for your days at Mtoni`,
        body: `Hi ${name},\n\nBased on what you've mentioned, you may enjoy a guided river walk in the golden hour and a candlelit dinner by the water. If you'd like to add a Lake Duluti canoe morning or an early Arusha coffee farm tour, we can pre-arrange transport.\n\nJust let us know and we'll take care of it.\n\nThe Mtoni team`,
        reasoning: "Suggests signature experiences aligned to typical guest interests.",
      };
    case "transfer_info":
      return {
        subject: `Airport transfer for your Mtoni stay`,
        body: `Hi ${name},\n\nWe can arrange a private transfer from Kilimanjaro International (JRO) or Arusha Airport (ARK). Share your flight number and arrival time and we'll confirm the driver and rate directly.\n\nThe Mtoni team`,
        reasoning: "Standard transfer prompt asking for flight details.",
      };
    case "follow_up":
      return {
        subject: `Thank you for staying with us`,
        body: `Hi ${name},\n\nAsante sana for choosing Mtoni River Lodge. It was a pleasure hosting you. If you enjoyed your stay, a short review would mean the world to our small team — and we'd love to welcome you back on your next journey to Tanzania.\n\nWith warm regards,\nThe Mtoni team`,
        reasoning: "Post-stay thank-you with a soft review nudge.",
      };
    case "custom":
    default:
      return {
        subject: `A note from Mtoni River Lodge`,
        body: `Hi ${name},\n\n[Draft body — please edit]\n\nThe Mtoni team`,
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
    let q = context.supabase
      .from("ai_communication_drafts")
      .select("*")
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
    const { error } = await context.supabase
      .from("ai_communication_drafts")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Escalations ─────────────────────────────────────────────────────────────
export const listEscalations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: EscalationStatus | "all" }) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("ai_escalations")
      .select("*")
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
    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "resolved" || data.status === "dismissed") {
        patch.resolved_at = new Date().toISOString();
      }
    }
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    if (data.resolution_notes !== undefined) patch.resolution_notes = data.resolution_notes;
    const { error } = await context.supabase
      .from("ai_escalations")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Analytics ───────────────────────────────────────────────────────────────
export const getOmnichannelAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const [web, wa, em, escOpen, drafts] = await Promise.all([
      context.supabase
        .from("ai_concierge_sessions")
        .select("id", { count: "exact", head: true })
        .eq("channel", "web")
        .gte("created_at", since),
      context.supabase
        .from("ai_concierge_sessions")
        .select("id", { count: "exact", head: true })
        .eq("channel", "whatsapp")
        .gte("created_at", since),
      context.supabase
        .from("ai_concierge_sessions")
        .select("id", { count: "exact", head: true })
        .eq("channel", "email")
        .gte("created_at", since),
      context.supabase
        .from("ai_escalations")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "assigned", "in_progress"]),
      context.supabase
        .from("ai_communication_drafts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    return {
      sessions_30d: {
        web: web.count ?? 0,
        whatsapp: wa.count ?? 0,
        email: em.count ?? 0,
      },
      escalations_open: escOpen.count ?? 0,
      drafts_pending: drafts.count ?? 0,
    };
  });