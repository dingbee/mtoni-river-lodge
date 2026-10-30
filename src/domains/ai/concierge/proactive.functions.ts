import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requirePropertyScope(sb: any, userId: string, roles: string[]): Promise<string> {
  const { data: propertyId, error: contextError } = await sb.rpc("staynas_active_property_id", { _uid: userId });
  if (contextError || !propertyId) throw new Error("No active property selected.");
  const { data: membership, error: membershipError } = await sb
    .from("staynas_property_members")
    .select("property_id")
    .eq("user_id", userId)
    .eq("property_id", propertyId)
    .eq("status", "active")
    .in("role", roles)
    .maybeSingle();
  if (membershipError || !membership) throw new Error("Forbidden");
  return String(propertyId);
}

async function requireBookingInProperty(sb: any, bookingId: string, propertyId: string) {
  const { data, error } = await sb
    .from("bookings")
    .select("id, guest_id, guest_name, guest_email, reference, check_in, check_out")
    .eq("id", bookingId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error || !data) throw new Error("Booking not found in the active property.");
  return data;
}

async function propertyBookingIds(sb: any, propertyId: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from("bookings").select("id").eq("property_id", propertyId).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((row: { id: string }) => row.id);
    ids.push(...page);
    if (page.length < pageSize) break;
  }
  return ids;
}

/**
 * Generate proactive pre-arrival recommendations for the next 14 days
 * and persist any that don't already exist. Idempotent per (booking, item).
 * AI SUGGESTS — never sends, never bills, never books.
 */
export const generatePreArrivalRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const propertyId = await requirePropertyScope(sb, context.userId, ["owner", "manager"]);
    const today = new Date();
    const in14 = new Date(today);
    in14.setDate(in14.getDate() + 14);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: bookings, error } = await sb
      .from("bookings")
      .select(
        "id, reference, guest_id, guest_name, check_in, check_out, adults, children, nights, special_requests, visit_purpose",
      )
      .eq("property_id", propertyId)
      .gte("check_in", iso(today))
      .lte("check_in", iso(in14))
      .neq("status", "cancelled")
      .order("check_in", { ascending: true });
    if (error) throw new Error(error.message);

    const created: any[] = [];
    for (const b of bookings ?? []) {
      const memMap: any[] = [];
      if (b.guest_id) {
        const { data } = await sb
          .from("ai_guest_memories")
          .select("memory_type, memory_key, memory_value")
          .eq("property_id", propertyId)
          .eq("guest_id", b.guest_id)
          .eq("status", "approved");
        memMap.push(...(data ?? []));
      }

      const proposals: Array<{ slug: string; type: string; title: string; reasoning: string; confidence: number; evidence: any }>
        = [];
      const text = `${b.special_requests ?? ""} ${b.visit_purpose ?? ""}`.toLowerCase();

      // Transport
      proposals.push({
        slug: "airport-transfer",
        type: "transport",
        title: "Offer airport transfer",
        reasoning: "Guests who share travel details may benefit from a pre-arranged transfer.",
        confidence: 0.7,
        evidence: { source: "booking", nights: b.nights },
      });

      // Kilimanjaro / trek
      if (/climb|trek|hike/.test(text)) {
        proposals.push({
          slug: "kilimanjaro-prep",
          type: "activity",
          title: "Review requested excursion arrangements",
          reasoning: "Special requests mention a climb, trek, or hike; confirm relevant local arrangements.",
          confidence: 0.9,
          evidence: { source: "special_requests", excerpt: b.special_requests },
        });
      }

      // Family
      if ((b.children ?? 0) > 0) {
        proposals.push({
          slug: "family-welcome",
          type: "room_preparation",
          title: "Review family room preparation",
          reasoning: "Children are included in the party; review the property's family preparation options.",
          confidence: 0.85,
          evidence: { source: "booking", children: b.children },
        });
      }

      // Honeymoon / anniversary / romantic
      if (/honeymoon|anniversar|romant/.test(text)) {
        proposals.push({
          slug: "special-occasion-review",
          type: "special_occasion",
          title: "Review special-occasion arrangements",
          reasoning: "Guest mentioned a special occasion; confirm which arrangements this property offers.",
          confidence: 0.82,
          evidence: { source: "special_requests", excerpt: b.special_requests },
        });
      }

      // Memory-driven
      for (const m of memMap) {
        if (m.memory_type === "interest") {
          proposals.push({
            slug: `interest-${String(m.memory_value ?? "").slice(0, 24)}`,
            type: "activity",
            title: `Curate ${String(m.memory_value ?? "activity")} experience`,
            reasoning: "Approved memory notes guest interest.",
            confidence: 0.72,
            evidence: { source: "memory", key: m.memory_key, value: m.memory_value },
          });
        }
      }

      // Communication
      if ((b.nights ?? 0) >= 3) {
        proposals.push({
          slug: "welcome-note",
          type: "communication",
          title: "Draft personalised welcome note",
          reasoning: "Multi-night stay merits a personalised welcome.",
          confidence: 0.75,
          evidence: { source: "booking", nights: b.nights },
        });
      }

      for (const p of proposals) {
        const { data: existing } = await sb
          .from("ai_concierge_recommendations")
          .select("id")
          .eq("booking_id", b.id)
          .eq("item_slug", p.slug)
          .maybeSingle();
        if (existing) continue;

        const { data: inserted, error: insErr } = await sb
          .from("ai_concierge_recommendations")
          .insert({
            booking_id: b.id,
            guest_id: b.guest_id,
            recommendation_type: p.type,
            item_slug: p.slug,
            item_name: p.title,
            title: p.title,
            reasoning: p.reasoning,
            confidence: p.confidence,
            evidence: p.evidence,
            status: "pending",
          })
          .select("id")
          .single();
        if (insErr) throw new Error(insErr.message);
        created.push(inserted);

        await sb.from("ai_guest_journey_events").insert({
          guest_id: b.guest_id,
          booking_id: b.id,
          event_type: "recommendation_generated",
          source: "ai",
          title: p.title,
          metadata: { type: p.type, confidence: p.confidence },
        });
      }
    }

    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "concierge.generate_prearrival_recommendations",
      tool_args: { created: created.length },
      status: "ok",
    });

    return { created: created.length };
  });

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        status: z.enum(["pending", "approved", "completed", "dismissed", "all"]).default("pending"),
        booking_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, ["owner", "manager", "admin", "reception"]);
    const bookingIds = await propertyBookingIds(context.supabase, propertyId);
    if (bookingIds.length === 0) return [];
    let q: any = context.supabase
      .from("ai_concierge_recommendations")
      .in("booking_id", bookingIds)
      .select(
        "id, guest_id, booking_id, session_id, recommendation_type, item_slug, item_name, title, reasoning, confidence, evidence, status, notes, reviewed_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.booking_id) q = q.eq("booking_id", data.booking_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "approved", "completed", "dismissed"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const sb: any = context.supabase;
    const propertyId = await requirePropertyScope(sb, context.userId, ["owner", "manager", "reception"]);
    const { data: existing, error: existingError } = await sb
      .from("ai_concierge_recommendations")
      .select("id, booking_id")
      .eq("id", data.id)
      .maybeSingle();
    if (existingError || !existing?.booking_id) throw new Error("Recommendation not found in the active property.");
    await requireBookingInProperty(sb, existing.booking_id, propertyId);
    const { data: row, error } = await sb
      .from("ai_concierge_recommendations")
      .update({
        status: data.status,
        notes: data.notes,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("booking_id", existing.booking_id)
      .select("id, booking_id, guest_id, title")
      .single();
    if (error) throw new Error(error.message);

    await sb.from("ai_guest_journey_events").insert({
      guest_id: row.guest_id,
      booking_id: row.booking_id,
      event_type: `recommendation_${data.status}`,
      source: "staff",
      title: row.title,
      metadata: { recommendation_id: row.id, notes: data.notes },
    });
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: `concierge.recommendation_${data.status}`,
      tool_args: { recommendation_id: row.id },
      status: "ok",
    });
    return row;
  });

export const getGuestJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        guest_id: z.string().uuid().optional(),
        booking_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, ["owner", "manager", "admin", "reception"]);
    if (!data.guest_id && !data.booking_id) {
      throw new Error("guest_id or booking_id required");
    }
    let bookingIds: string[];
    if (data.booking_id) {
      bookingIds = [(await requireBookingInProperty(context.supabase, data.booking_id, propertyId)).id];
    } else {
      const { data: guestBookings, error: bookingsError } = await context.supabase
        .from("bookings")
        .select("id")
        .eq("property_id", propertyId)
        .eq("guest_id", data.guest_id);
      if (bookingsError) throw new Error(bookingsError.message);
      bookingIds = (guestBookings ?? []).map((booking: { id: string }) => booking.id);
    }
    if (bookingIds.length === 0) return [];
    let q: any = context.supabase
      .from("ai_guest_journey_events")
      .select("id, guest_id, booking_id, event_type, source, title, metadata, occurred_at")
      .in("booking_id", bookingIds)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listStayInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ booking_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, ["owner", "manager", "admin", "reception"]);
    await requireBookingInProperty(context.supabase, data.booking_id, propertyId);
    const { data: rows, error } = await context.supabase
      .from("ai_stay_insights")
      .select("id, insight_type, content, confidence, evidence, status, created_at")
      .eq("booking_id", data.booking_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Generate post-stay drafts (thank-you, review request, return invite) as
 * ai_communication_drafts requiring human approval before send.
 */
export const generatePostStayDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ booking_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const sb: any = context.supabase;
    const propertyId = await requirePropertyScope(sb, context.userId, ["owner", "manager"]);
    const b = await requireBookingInProperty(sb, data.booking_id, propertyId);

    const drafts = [
      {
        kind: "follow_up",
        subject: `Thank you for your stay, ${b.guest_name?.split(" ")[0] ?? "guest"}`,
        body:
          `Dear ${b.guest_name ?? "guest"},\n\nThank you for choosing to stay with us. We hope you had a pleasant experience. Your feedback is valuable to the property team, and we would be pleased to welcome you again.\n\nKind regards,\nThe property team`,
      },
      {
        kind: "follow_up",
        subject: "Would you share feedback about your stay?",
        body:
          `Dear ${b.guest_name ?? "guest"},\n\nIf you have a moment, we would appreciate your feedback about your stay. Your comments help the property team improve the guest experience.\n\nKind regards,\nThe property team`,
      },
      {
        kind: "follow_up",
        subject: "We would be pleased to welcome you again",
        body:
          `Dear ${b.guest_name ?? "guest"},\n\nWe would be pleased to welcome you again whenever your plans bring you back to the area. Please contact the property team for future-stay information.\n\nKind regards,\nThe property team`,
      },
    ];

    const inserted: any[] = [];
    for (const d of drafts) {
      const { data: row, error: e2 } = await sb
        .from("ai_communication_drafts")
        .insert({
          channel: "email",
          draft_type: d.kind,
          subject: d.subject,
          body: d.body,
          booking_id: b.id,
          guest_id: b.guest_id,
          created_by: context.userId,
          status: "pending",
          reasoning: "Post-stay relationship draft — human approval required before send.",
          supporting_context: { source: "post_stay", booking_ref: b.reference },
          created_by: context.userId,
        })
        .select("id, draft_type")
        .single();
      if (e2) throw new Error(e2.message);
      inserted.push(row);
    }

    await sb.from("ai_guest_journey_events").insert({
      guest_id: b.guest_id,
      booking_id: b.id,
      event_type: "post_stay_drafts_generated",
      source: "ai",
      title: "Post-stay drafts prepared",
      metadata: { count: inserted.length },
    });
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "concierge.generate_post_stay_drafts",
      tool_args: { booking_id: b.id, drafts: inserted.length },
      status: "ok",
    });

    return { drafts: inserted };
  });

/**
 * Personalisation analytics — recommendation acceptance and journey volumes.
 */
export const getPersonalisationMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ window: z.enum(["7d", "30d", "90d"]).default("30d") }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const propertyId = await requirePropertyScope(context.supabase, context.userId, ["owner", "manager", "admin", "reception"]);
    const bookingIds = await propertyBookingIds(context.supabase, propertyId);
    if (bookingIds.length === 0) return { total: 0, approved: 0, completed: 0, dismissed: 0, acceptance: 0 };
    const days = data.window === "7d" ? 7 : data.window === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const sb: any = context.supabase;
    const { data: rows, error } = await sb
      .from("ai_concierge_recommendations")
      .select("status")
      .in("booking_id", bookingIds)
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    const total = rows?.length ?? 0;
    const approved = rows?.filter((r: any) => r.status === "approved").length ?? 0;
    const completed = rows?.filter((r: any) => r.status === "completed").length ?? 0;
    const dismissed = rows?.filter((r: any) => r.status === "dismissed").length ?? 0;
    const acceptance = total > 0 ? (approved + completed) / total : 0;
    return { total, approved, completed, dismissed, acceptance };
  });