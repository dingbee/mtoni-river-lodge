import { createHash } from "node:crypto";
import { communicationDraftFingerprint } from "./draft-fingerprint.server";
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
    let q = (context.supabase as any)
      .from("ai_concierge_sessions")
      .select(
        "id, channel, locale, page_context, guest_id, guest_name, guest_email, guest_phone, message_count, escalated, identity_confidence, last_active_at, created_at",
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: contactPreferences, error: contactError }, { data: guestPreferences, error: guestError }, { data: propertyBindings, error: bindingsError }] = await Promise.all([
      admin.from("ai_guest_channel_contact_preferences")
        .select("channel,external_contact,purpose,consent_status,consent_source,captured_at,withdrawn_at")
        .eq("property_id", propertyId).order("captured_at", { ascending: false }).limit(2000),
      admin.from("ai_guest_channel_preferences")
        .select("guest_id,session_id,channel,purpose,consent_status,consent_source,captured_at,withdrawn_at")
        .eq("property_id", propertyId).order("captured_at", { ascending: false }).limit(2000),
      admin.from("ai_provider_property_bindings").select("provider,external_account_id")
        .eq("property_id", propertyId).eq("enabled", true),
    ]);
    if (contactError || guestError || bindingsError) throw new Error("Channel consent status could not be loaded.");
    const accountIds = [...new Set((propertyBindings ?? []).map((binding: any) => binding.external_account_id).filter(Boolean))];
    const { data: accountSuppressions, error: accountSuppressionError } = await admin.from("ai_provider_account_suppressions")
      .select("provider,external_account_id,channel,external_contact,purpose,consent_status,source,captured_at,withdrawn_at")
      .in("external_account_id", accountIds.length ? accountIds : ["__no_bound_provider_account__"])
      .order("captured_at", { ascending: false }).limit(2000);
    if (accountSuppressionError) throw new Error("Provider-account suppression status could not be loaded.");
    return (rows ?? []).map((row: any) => {
      const externalContact = row.channel === "email"
        ? String(row.guest_email ?? "").trim().toLowerCase()
        : String(row.guest_phone ?? "").trim();
      const contactRows = (contactPreferences ?? []).filter((preference: any) =>
        preference.channel === row.channel &&
        String(preference.external_contact ?? "").trim().toLowerCase() === externalContact,
      );
      const guestRows = (guestPreferences ?? []).filter((preference: any) =>
        preference.channel === row.channel &&
        ((row.guest_id && preference.guest_id === row.guest_id) ||
          (!row.guest_id && preference.session_id === row.id)),
      );
      const expectedProvider = row.channel === "whatsapp" ? "meta_cloud_api" : "resend";
      const boundAccountIds = new Set((propertyBindings ?? [])
        .filter((binding: any) => binding.provider === expectedProvider)
        .map((binding: any) => binding.external_account_id));
      const accountRows = (accountSuppressions ?? [])
        .filter((preference: any) => preference.provider === expectedProvider
          && boundAccountIds.has(preference.external_account_id)
          && preference.channel === row.channel
          && String(preference.external_contact ?? "").trim().toLowerCase() === externalContact)
        .map((preference: any) => ({ ...preference, consent_source: preference.source }));
      const consentByPurpose = new Map<string, any>();
      for (const preference of [...guestRows, ...contactRows, ...accountRows]) {
        const existing = consentByPurpose.get(preference.purpose);
        if (!existing || new Date(preference.captured_at).getTime() > new Date(existing.captured_at).getTime()) {
          consentByPurpose.set(preference.purpose, preference);
        }
      }
      const safeRow = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "guest_phone"));
      return {
        ...safeRow,
        channel_consent: [...consentByPurpose.values()].map((preference: any) => ({
          purpose: preference.purpose,
          consent_status: preference.consent_status,
          consent_source: preference.consent_source,
          captured_at: preference.captured_at,
          withdrawn_at: preference.withdrawn_at,
        })),
      };
    });
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
      if (!["welcome", "pre_arrival", "activity_intro", "transfer_info", "follow_up", "custom", "concierge_response"].includes(input?.draft_type)) throw new Error("invalid draft_type");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
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
      if (booking.guest_id && session.guest_id !== booking.guest_id) {
        throw new Error("Booking does not belong to the conversation guest.");
      }
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
    const sessionSet = new Set(sessionIds);
    const bookingSet = new Set(bookingIds);
    return Array.from(unique.values())
      .filter((row) => {
        const sessionScoped = Boolean(row.session_id && sessionSet.has(row.session_id));
        const bookingScoped = Boolean(row.booking_id && bookingSet.has(row.booking_id));
        if (row.session_id && row.booking_id) return sessionScoped && bookingScoped;
        return sessionScoped || bookingScoped;
      })
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
      provider_template_name?: string | null;
      provider_template_language?: string | null;
      provider_template_components?: unknown;
    }) => {
      if (!input?.id) throw new Error("id required");
      if (input.status && !["pending", "approved", "edited", "rejected", "archived"].includes(input.status)) throw new Error("invalid draft status; provider acceptance is recorded only by dispatch");
      if (input.provider_template_name && !/^[a-z0-9_]{1,512}$/.test(input.provider_template_name)) throw new Error("invalid WhatsApp template name");
      if (input.provider_template_language && !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(input.provider_template_language)) throw new Error("invalid WhatsApp template language");
      if (input.provider_template_components !== undefined && (!Array.isArray(input.provider_template_components) || input.provider_template_components.length > 10)) throw new Error("invalid WhatsApp template components");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
    const { data: existingDraft, error: draftError } = await (context.supabase as any)
      .from("ai_communication_drafts")
      .select("id, session_id, booking_id, subject, body, status, content_version, provider_template_name, provider_template_language, provider_template_components")
      .eq("id", data.id)
      .maybeSingle();
    if (draftError || !existingDraft) throw new Error("Draft not found in the active property.");
    if (existingDraft.status === "sent") throw new Error("A provider-accepted draft is immutable. Create a new draft for any follow-up message.");
    let belongsToProperty = false;
    if (existingDraft.session_id) {
      await requireSessionInProperty(context.supabase, existingDraft.session_id, propertyId);
      belongsToProperty = true;
    }
    if (existingDraft.booking_id) {
      await requireBookingInProperty(context.supabase, existingDraft.booking_id, propertyId);
      belongsToProperty = true;
    }
    if (!belongsToProperty) throw new Error("Draft not found in the active property.");
    const patch: Record<string, unknown> = {};
    const effectiveSubject = data.subject !== undefined ? data.subject : existingDraft.subject;
    const effectiveBody = data.body !== undefined ? data.body : existingDraft.body;
    const effectiveTemplateName = data.provider_template_name !== undefined ? data.provider_template_name : existingDraft.provider_template_name;
    const effectiveTemplateLanguage = data.provider_template_language !== undefined ? data.provider_template_language : existingDraft.provider_template_language;
    const effectiveTemplateComponents = data.provider_template_components !== undefined ? data.provider_template_components : existingDraft.provider_template_components;
    const contentChanged =
      data.subject !== undefined && data.subject !== existingDraft.subject ||
      data.body !== undefined && data.body !== existingDraft.body ||
      data.provider_template_name !== undefined && data.provider_template_name !== existingDraft.provider_template_name ||
      data.provider_template_language !== undefined && data.provider_template_language !== existingDraft.provider_template_language ||
      data.provider_template_components !== undefined && JSON.stringify(data.provider_template_components) !== JSON.stringify(existingDraft.provider_template_components);

    if (data.subject !== undefined) patch.subject = data.subject;
    if (data.body !== undefined) patch.body = data.body;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.provider_template_name !== undefined) patch.provider_template_name = data.provider_template_name;
    if (data.provider_template_language !== undefined) patch.provider_template_language = data.provider_template_language;
    if (data.provider_template_components !== undefined) patch.provider_template_components = data.provider_template_components;

    const nextVersion = Number(existingDraft.content_version ?? 1) + (contentChanged ? 1 : 0);
    if (contentChanged) patch.content_version = nextVersion;

    if (data.status === "approved") {
      await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
      patch.status = "approved";
      patch.approved_by = context.userId;
      patch.approved_by_system = false;
      patch.approved_at = new Date().toISOString();
      patch.approved_content_hash = communicationDraftFingerprint({
        subject: effectiveSubject,
        body: effectiveBody,
        providerTemplateName: effectiveTemplateName,
        providerTemplateLanguage: effectiveTemplateLanguage,
        providerTemplateComponents: effectiveTemplateComponents,
      });
      patch.approved_content_version = nextVersion;
    } else if (data.status === "rejected") {
      patch.status = "rejected";
      patch.approved_by = null;
      patch.approved_by_system = false;
      patch.approved_at = null;
      patch.approved_content_hash = null;
      patch.approved_content_version = null;
    } else if (data.status === "edited" || contentChanged) {
      patch.status = "edited";
      patch.approved_by = null;
      patch.approved_by_system = false;
      patch.approved_at = null;
      patch.approved_content_hash = null;
      patch.approved_content_version = null;
    } else if (data.status) {
      patch.status = data.status;
      patch.approved_by = null;
      patch.approved_by_system = false;
      patch.approved_at = null;
      patch.approved_content_hash = null;
      patch.approved_content_version = null;
    }
    if (Object.keys(patch).length === 0) throw new Error("No draft changes supplied.");
    const { data: updated, error } = await (context.supabase as any)
      .from("ai_communication_drafts")
      .update(patch)
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
    let q = context.supabase
      .from("ai_escalations")
      .select("*,assignment_due_at,acknowledgement_due_at,resolution_due_at,reopened_at")
      .eq("property_id", propertyId)
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
    const session = await requireSessionInProperty(context.supabase, data.session_id, propertyId);
    const dedupeKey = createHash("sha256")
      .update([propertyId, data.session_id, data.reason, data.summary ?? ""].join("|"))
      .digest("hex");
    const { data: result, error } = await (context.supabase as any).rpc("staynas_create_concierge_escalation", {
      p_property_id: propertyId,
      p_session_id: data.session_id,
      p_guest_id: session.guest_id,
      p_channel: data.channel,
      p_reason: data.reason,
      p_summary: data.summary ?? null,
      p_ai_confidence: data.ai_confidence ?? null,
      p_priority: data.priority ?? 2,
      p_dedupe_key: dedupeKey,
    });
    if (error) throw new Error("Could not create the property escalation.");
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.escalation_id) throw new Error("Could not confirm the property escalation.");
    return { id: row.escalation_id };
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
    const { error } = await (context.supabase as any).rpc("staynas_transition_concierge_escalation", {
      p_escalation_id: data.id,
      p_property_id: propertyId,
      p_status: data.status ?? null,
      p_assigned_to: data.assigned_to ?? null,
      p_resolution_notes: data.resolution_notes ?? null,
    });
    if (error) throw new Error("Could not update the property escalation.");
    return { ok: true };
  });

export const listEscalationAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
    const { data, error } = await (context.supabase as any).from("staynas_property_members")
      .select("user_id,role").eq("property_id",propertyId).eq("status","active")
      .in("role",["owner","manager","admin","reservations","reception"]).order("role");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listEscalationSlaPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
    const { data, error } = await (context.supabase as any).from("ai_escalation_sla_policies")
      .select("*").eq("property_id", propertyId).order("priority");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateEscalationSlaPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string; enabled?: boolean; acknowledgement_minutes?: number; assignment_minutes?: number;
    resolution_minutes?: number; business_hours_only?: boolean; operating_hours?: Record<string, unknown>;
    warning_percent?: number;
  }) => {
    if (!input?.id) throw new Error("Policy id is required.");
    const bounds = [["acknowledgement_minutes",input.acknowledgement_minutes,1,10080],["assignment_minutes",input.assignment_minutes,1,10080],["resolution_minutes",input.resolution_minutes,1,43200],["warning_percent",input.warning_percent,1,99]] as const;
    for (const [key,value,min,max] of bounds) if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) throw new Error("Invalid SLA policy value: " + key);
    if (input.operating_hours !== undefined) {
      const mode = input.operating_hours.mode;
      if (mode !== "24x7" && mode !== "weekly") throw new Error("Operating calendar mode must be 24x7 or weekly.");
      if (mode === "weekly") for (const day of ["mon","tue","wed","thu","fri","sat","sun"]) {
        const windows = input.operating_hours[day];
        if (!Array.isArray(windows)) throw new Error("Weekly calendar must define all seven days.");
        for (const window of windows as Array<{start?:string;end?:string}>) {
          if (!window || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(window.start ?? "") || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(window.end ?? "") || (window.start ?? "") >= (window.end ?? "")) throw new Error("Calendar windows must use HH:MM and end after they start.");
        }
      }
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
    const patch: Record<string, unknown> = { updated_by: context.userId, updated_at: new Date().toISOString() };
    for (const key of ["enabled","acknowledgement_minutes","assignment_minutes","resolution_minutes","business_hours_only","operating_hours","warning_percent"] as const) if (data[key] !== undefined) patch[key] = data[key];
    const { data: row, error } = await (context.supabase as any).from("ai_escalation_sla_policies").update(patch).eq("id",data.id).eq("property_id",propertyId).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("SLA policy not found in the active property.");
    return { ok: true };
  });

export const listEscalationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { escalation_id: string }) => { if (!input?.escalation_id) throw new Error("Escalation id is required."); return input; })
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId);
    const { data: rows, error } = await (context.supabase as any).from("ai_escalation_events").select("*")
      .eq("property_id",propertyId).eq("escalation_id",data.escalation_id).order("occurred_at",{ascending:true}).limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
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
    const bookingIds = await propertyBookingIds(context.supabase, propertyId);
    const [escOpen, sessionDrafts, bookingDrafts] = await Promise.all([
      sessionIds.length
        ? context.supabase.from("ai_escalations").select("id", { count: "exact", head: true }).in("session_id", sessionIds).in("status", ["open", "assigned", "in_progress"])
        : Promise.resolve({ count: 0, error: null }),
      sessionIds.length
        ? context.supabase.from("ai_communication_drafts").select("id, session_id, booking_id").in("session_id", sessionIds).eq("status", "pending")
        : Promise.resolve({ data: [], error: null }),
      bookingIds.length
        ? context.supabase.from("ai_communication_drafts").select("id, session_id, booking_id").in("booking_id", bookingIds).eq("status", "pending")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (escOpen.error) throw new Error(escOpen.error.message);
    if (sessionDrafts.error) throw new Error(sessionDrafts.error.message);
    if (bookingDrafts.error) throw new Error(bookingDrafts.error.message);
    const sessionSet = new Set(sessionIds);
    const bookingSet = new Set(bookingIds);
    const pendingDraftIds = new Set(
      [...(sessionDrafts.data ?? []), ...(bookingDrafts.data ?? [])]
        .filter((row: { session_id: string | null; booking_id: string | null }) => {
          const sessionScoped = Boolean(row.session_id && sessionSet.has(row.session_id));
          const bookingScoped = Boolean(row.booking_id && bookingSet.has(row.booking_id));
          if (row.session_id && row.booking_id) return sessionScoped && bookingScoped;
          return sessionScoped || bookingScoped;
        })
        .map((row: { id: string }) => row.id),
    );
    return {
      sessions_30d: {
        web: sessions.filter((row: any) => row.channel === "web").length,
        whatsapp: sessions.filter((row: any) => row.channel === "whatsapp").length,
        email: sessions.filter((row: any) => row.channel === "email").length,
      },
      escalations_open: escOpen.count ?? 0,
      drafts_pending: pendingDraftIds.size,
    };
  });

export const listCommunicationDispatchAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } = {}) => ({
    limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
  }))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, MANAGER_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).from("ai_communication_dispatch_attempts")
      .select("id,draft_id,message_id,channel,provider,idempotency_key,attempt_number,max_attempts,status,provider_message_id,error_code,error_summary,next_retry_at,started_at,finished_at,manual_retry_authorized,recovery_requested_at,recovery_reason")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const { data: priorRecoveries, error: recoveryLookupError } = await (supabaseAdmin as any).from("ai_communication_dispatch_attempts")
      .select("draft_id").eq("property_id", propertyId)
      .not("recovery_requested_at", "is", null).limit(1000);
    if (recoveryLookupError) throw new Error("Dispatch recovery history could not be loaded.");
    const recoveredDraftIds = new Set((priorRecoveries ?? []).map((row: any) => row.draft_id));
    const latestByDraft = new Map<string, string>();
    for (const attempt of rows ?? []) {
      if (attempt.draft_id && !latestByDraft.has(attempt.draft_id)) latestByDraft.set(attempt.draft_id, attempt.id);
    }
    return (rows ?? []).map((attempt: any) => {
      const httpStatus = Number(/^http_(\d{3})/.exec(String(attempt.error_code ?? ""))?.[1] ?? 0);
      const recoverableProviderFailure = attempt.provider === "meta_cloud_api"
        ? httpStatus === 429
        : attempt.provider === "resend"
          && ([408, 425, 429].includes(httpStatus) || httpStatus >= 500 || attempt.error_code === "network_error");
      return {
        ...attempt,
        recoverable: attempt.status === "permanent_failure"
          && latestByDraft.get(attempt.draft_id) === attempt.id
          && !recoveredDraftIds.has(attempt.draft_id)
          && recoverableProviderFailure,
      };
    });
  });
