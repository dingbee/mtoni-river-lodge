import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function assertRole(sb: any, userId: string, roles: string[]) {
  const { data, error } = await sb.rpc("has_any_role", { _user_id: userId, _roles: roles });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/**
 * Generate proactive pre-arrival recommendations for the next 14 days
 * and persist any that don't already exist. Idempotent per (booking, item).
 * AI SUGGESTS — never sends, never bills, never books.
 */
export const generatePreArrivalRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRole(context.supabase, context.userId, [
      "owner",
      "manager",
      "admin",
      "reservations",
    ]);
    const sb: any = context.supabase;
    const today = new Date();
    const in14 = new Date(today);
    in14.setDate(in14.getDate() + 14);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: bookings, error } = await sb
      .from("bookings")
      .select(
        "id, reference, guest_id, guest_name, check_in, check_out, adults, children, nights, special_requests, visit_purpose",
      )
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
        reasoning: "Guests arriving from JRO/ARK benefit from a pre-booked transfer.",
        confidence: 0.7,
        evidence: { source: "booking", nights: b.nights },
      });

      // Kilimanjaro / trek
      if (/kilimanjaro|climb|trek/.test(text)) {
        proposals.push({
          slug: "kilimanjaro-prep",
          type: "activity",
          title: "Prepare early breakfast + trek transport",
          reasoning: "Special requests reference Kilimanjaro/trekking.",
          confidence: 0.9,
          evidence: { source: "special_requests", excerpt: b.special_requests },
        });
      }

      // Family
      if ((b.children ?? 0) > 0) {
        proposals.push({
          slug: "family-welcome",
          type: "room_preparation",
          title: "Prepare family welcome",
          reasoning: "Children in party — add extra towels, activity guide.",
          confidence: 0.85,
          evidence: { source: "booking", children: b.children },
        });
      }

      // Honeymoon / anniversary / romantic
      if (/honeymoon|anniversar|romant/.test(text)) {
        proposals.push({
          slug: "romantic-turndown",
          type: "special_occasion",
          title: "Suggest romantic turndown + private dining",
          reasoning: "Guest mentioned honeymoon/anniversary/romantic occasion.",
          confidence: 0.82,
          evidence: { source: "special_requests", excerpt: b.special_requests },
        });
      }

      // Memory-driven
      for (const m of memMap) {
        if (m.memory_key === "preference.room.river_facing") {
          proposals.push({
            slug: "river-facing",
            type: "room_preparation",
            title: "Assign river-facing allocation",
            reasoning: "Approved memory: guest prefers river-facing rooms.",
            confidence: 0.8,
            evidence: { source: "memory", key: m.memory_key },
          });
        }
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
      module: "concierge",
      action: "generate_prearrival_recommendations",
      metadata: { created: created.length },
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
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_concierge_recommendations")
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
    await assertRole(context.supabase, context.userId, [
      "owner",
      "manager",
      "admin",
      "reservations",
      "reception",
    ]);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_concierge_recommendations")
      .update({
        status: data.status,
        notes: data.notes,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
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
      module: "concierge",
      action: `recommendation_${data.status}`,
      metadata: { recommendation_id: row.id },
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
    await assertStaff(context.supabase, context.userId);
    if (!data.guest_id && !data.booking_id) {
      throw new Error("guest_id or booking_id required");
    }
    let q: any = context.supabase
      .from("ai_guest_journey_events")
      .select("id, guest_id, booking_id, event_type, source, title, metadata, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.guest_id) q = q.eq("guest_id", data.guest_id);
    if (data.booking_id) q = q.eq("booking_id", data.booking_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listStayInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ booking_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
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
    await assertRole(context.supabase, context.userId, [
      "owner",
      "manager",
      "admin",
      "reservations",
    ]);
    const sb: any = context.supabase;
    const { data: b, error } = await sb
      .from("bookings")
      .select("id, reference, guest_id, guest_name, guest_email, check_in, check_out")
      .eq("id", data.booking_id)
      .single();
    if (error) throw new Error(error.message);

    const drafts = [
      {
        kind: "post_stay_thank_you",
        subject: `Asante, ${b.guest_name?.split(" ")[0] ?? "guest"} — thank you for staying at Mtoni`,
        body:
          `Dear ${b.guest_name},\n\nIt was our pleasure to host you at Mtoni River Lodge. ` +
          `We hope your time by the Nduruma River was restorative.\n\n` +
          `Warm regards,\nMtoni River Lodge`,
      },
      {
        kind: "post_stay_review_request",
        subject: "A quick favour — share your Mtoni experience",
        body:
          `Dear ${b.guest_name},\n\nIf you enjoyed your stay, we would be grateful for a short review. ` +
          `Your words help fellow travellers find us.\n\nAsante sana,\nMtoni River Lodge`,
      },
      {
        kind: "post_stay_return_invite",
        subject: "Karibu tena — a returning-guest welcome from Mtoni",
        body:
          `Dear ${b.guest_name},\n\nWhenever you are ready for another gentle escape, ` +
          `we would love to welcome you back with a returning-guest gesture.\n\n` +
          `Warmly,\nMtoni River Lodge`,
      },
    ];

    const inserted: any[] = [];
    for (const d of drafts) {
      const { data: row, error: e2 } = await sb
        .from("ai_communication_drafts")
        .insert({
          channel: "email",
          purpose: d.kind,
          subject: d.subject,
          body: d.body,
          related_booking_id: b.id,
          related_guest_id: b.guest_id,
          status: "pending_approval",
          confidence: 0.75,
          evidence: { source: "post_stay", booking_ref: b.reference },
          created_by_role: "ai",
        })
        .select("id, purpose")
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
      module: "concierge",
      action: "generate_post_stay_drafts",
      metadata: { booking_id: b.id, drafts: inserted.length },
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
    await assertStaff(context.supabase, context.userId);
    const days = data.window === "7d" ? 7 : data.window === "90d" ? 90 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const sb: any = context.supabase;
    const { data: rows, error } = await sb
      .from("ai_concierge_recommendations")
      .select("status")
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    const total = rows?.length ?? 0;
    const approved = rows?.filter((r: any) => r.status === "approved").length ?? 0;
    const completed = rows?.filter((r: any) => r.status === "completed").length ?? 0;
    const dismissed = rows?.filter((r: any) => r.status === "dismissed").length ?? 0;
    const acceptance = total > 0 ? (approved + completed) / total : 0;
    return { total, approved, completed, dismissed, acceptance };
  });