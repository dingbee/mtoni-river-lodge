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
): Promise<{ id: string; guest_id: string | null }> {
  const { data, error } = await supabase
    .from("ai_concierge_sessions")
    .select("id, guest_id")
    .eq("id", sessionId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error || !data) throw new Error("Conversation not found in the active property.");
  return data as { id: string; guest_id: string | null };
}

async function propertySessionIds(supabase: any, propertyId: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("ai_concierge_sessions")
      .select("id")
      .eq("property_id", propertyId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((row: { id: string }) => row.id);
    ids.push(...page);
    if (page.length < pageSize) break;
  }
  return ids;
}

async function propertyBookingIds(supabase: any, propertyId: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id")
      .eq("property_id", propertyId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((row: { id: string }) => row.id);
    ids.push(...page);
    if (page.length < pageSize) break;
  }
  return ids;
}

async function requireBookingInProperty(supabase: any, bookingId: string, propertyId: string): Promise<void> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error || !data) throw new Error("Booking not found in the active property.");
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
        "id, channel, locale, page_context, guest_id, guest_name, guest_email, message_count, escalated, identity_confidence, last_active_at, created_at",
      )
      .eq("property_id", propertyId)
      .order("last_active_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit ?? 100, 1), 300));
    if (data.channel && data.channel !== "all") q = q.eq("channel", data.channel);
    if (data.escalated) q = q.eq("escalated", true);
    if (data.guest_query) {
      const s = data.guest_query.trim().replace(/[(),]/g, "");
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
        subject: `Welcome to your stay, ${name}`,
        body: `Hi ${name},\n\nWe're looking forward to welcoming you to the property${ctx.room_slug ? ` in ${roomName}` : ""}${ctx.check_in ? ` from ${ctx.check_in}` : ""}. Let us know if there is anything the team should know before your arrival.\n\nKind regards,\nThe property team`,
        reasoning: "A neutral welcome draft using only the room and arrival details supplied.",
      };
    case "pre_arrival":
      return {
        subject: `Preparing for your arrival`,
        body: `Hi ${name},\n\nYour stay is approaching. The property team is preparing for your arrival. Please reply with your estimated arrival time and let us know about any dietary, accessibility, transport, or special-arrangement requirements. The team will confirm the property's check-in details and available services.\n\nKind regards,\nThe property team`,
        reasoning: "A property-neutral pre-arrival draft that avoids unconfigured times or services.",
      };
    case "activity_intro":
      return {
        subject: `Experiences during your stay`,
        body: `Hi ${name},\n\nWe'd be pleased to help you explore the experiences available at the property. Let us know what interests you and the team can share suitable options, availability, and any applicable rates.\n\nKind regards,\nThe property team`,
        reasoning: "Invites the guest to explore experiences without inventing property-specific offerings.",
      };
    case "transfer_info":
      return {
        subject: `Transport arrangements for your stay`,
        body: `Hi ${name},\n\nIf you require transport assistance, please share your arrival or departure details and preferred arrangements. The property team will confirm the available options and applicable rates.\n\nKind regards,\nThe property team`,
        reasoning: "Requests transport details without assuming an airport, provider, or fixed rate.",
      };
    case "follow_up":
      return {
        subject: `Thank you for your stay`,
        body: `Hi ${name},\n\nThank you for choosing to stay with us. We hope you had a pleasant experience. Your feedback is valuable to the property team, and we would be pleased to welcome you again.\n\nKind regards,\nThe property team`,
        reasoning: "A neutral post-stay thank-you with a feedback invitation.",
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
      if (!["welcome", "pre_arrival", "activity_intro", "transfer_info", "follow_up", "custom"].includes(input?.draft_type)) throw new Error("invalid draft_type");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    if (!data.session_id) throw new Error("A conversation from the active property is required.");
    const session = await requireSessionInProperty(context.supabase, data.session_id, propertyId);
    if (data.guest_id && data.guest_id !== session.guest_id) {
      throw new Error("Guest does not match the selected conversation.");
    }
    if (data.booking_id) {
      const { data: booking, error: bookingError } = await context.supabase
        .from("bookings")
        .select("id, guest_id")
        .eq("id", data.booking_id)
        .eq("property_id", propertyId)
        .maybeSingle();
      if (bookingError || !booking) throw new Error("Booking not found in the active property.");
      if (data.guest_id && booking.guest_id && data.guest_id !== booking.guest_id) {
        throw new Error("Booking does not belong to the selected guest.");
      }
      if (session.guest_id && booking.guest_id && session.guest_id !== booking.guest_id) {
        throw new Error("Booking does not belong to the conversation guest.");
      }
    }
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
        guest_id: data.guest_id ?? session.guest_id ?? null,
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
    const [sessionIds, bookingIds] = await Promise.all([
      propertySessionIds(context.supabase, propertyId),
      propertyBookingIds(context.supabase, propertyId),
    ]);
    const [sessionDrafts, bookingDrafts] = await Promise.all([
      sessionIds.length
        ? context.supabase.from("ai_communication_drafts").select("*").in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      bookingIds.length
        ? context.supabase.from("ai_communication_drafts").select("*").in("booking_id", bookingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sessionDrafts.error) throw new Error(sessionDrafts.error.message);
    if (bookingDrafts.error) throw new Error(bookingDrafts.error.message);
    const unique = new Map<string, CommunicationDraftRow>();
    for (const row of [...(sessionDrafts.data ?? []), ...(bookingDrafts.data ?? [])]) unique.set(row.id, row as CommunicationDraftRow);
    return Array.from(unique.values())
      .filter((row) => !data.status || data.status === "all" || row.status === data.status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 200);
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
    const { data: existingDraft, error: draftError } = await context.supabase
      .from("ai_communication_drafts")
      .select("id, session_id, booking_id")
      .eq("id", data.id)
      .maybeSingle();
    if (draftError || !existingDraft) throw new Error("Draft not found in the active property.");
    let belongsToProperty = false;
    if (existingDraft.session_id) {
      try {
        await requireSessionInProperty(context.supabase, existingDraft.session_id, propertyId);
        belongsToProperty = true;
      } catch { /* check booking association next */ }
    }
    if (!belongsToProperty && existingDraft.booking_id) {
      await requireBookingInProperty(context.supabase, existingDraft.booking_id, propertyId);
      belongsToProperty = true;
    }
    if (!belongsToProperty) throw new Error("Draft not found in the active property.");
    const patch: Record<string, unknown> = {};
    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.body !== undefined) patch.body = data.body;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status) {
      if (["approved", "rejected", "sent", "archived"].includes(data.status)) {
        await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
      }
      patch.status = data.status;
      if (data.status === "approved") {
        patch.approved_by = context.userId;
        patch.approved_at = new Date().toISOString();
      }
    }
    if (Object.keys(patch).length === 0) throw new Error("No draft changes supplied.");
    const { data: updated, error } = await context.supabase
      .from("ai_communication_drafts")
      .update(patch as never)
      .eq("id", data.id)
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
      if (!["low_confidence", "complaint", "payment_issue", "complex_request", "human_requested", "other"].includes(input.reason)) throw new Error("invalid escalation reason");
      if (input.priority !== undefined && ![1, 2, 3].includes(input.priority)) throw new Error("invalid priority");
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
      if (input.status && !["open", "assigned", "in_progress", "resolved", "dismissed"].includes(input.status)) throw new Error("invalid escalation status");
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
    if (data.assigned_to !== undefined) {
      if (data.assigned_to !== null) {
        const { data: assignee, error: assigneeError } = await context.supabase
          .from("staynas_property_members")
          .select("user_id")
          .eq("user_id", data.assigned_to)
          .eq("property_id", propertyId)
          .eq("status", "active")
          .maybeSingle();
        if (assigneeError || !assignee) throw new Error("Assignee must be an active member of the selected property.");
      }
      patch.assigned_to = data.assigned_to;
    }
    if (data.resolution_notes !== undefined) patch.resolution_notes = data.resolution_notes;
    if (Object.keys(patch).length === 0) throw new Error("No escalation changes supplied.");
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