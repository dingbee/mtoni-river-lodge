import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "@/lib/activity-log.server";

// Any-staff gate; RLS enforces the same, but we fail fast with a friendly message.
async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(["all", "new", "returning", "vip"]).default("all"),
  tagIds: z.array(z.string().uuid()).default([]),
  sort: z
    .enum([
      "name_asc",
      "name_desc",
      "last_stay_desc",
      "last_stay_asc",
      "total_stays_desc",
      "lifetime_spend_desc",
      "created_desc",
    ])
    .default("last_stay_desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
});

export const listGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    let query = sb
      .from("guest_directory")
      .select("*", { count: "exact" });

    if (data.status !== "all") query = query.eq("status", data.status);

    if (data.tagIds.length > 0) query = query.overlaps("tag_ids", data.tagIds);

    if (data.q) {
      const like = `%${data.q.replace(/[%_]/g, "\\$&")}%`;
      query = query.or(
        [
          `full_name.ilike.${like}`,
          `email.ilike.${like}`,
          `phone_e164.ilike.${like}`,
          `country.ilike.${like}`,
        ].join(","),
      );
    }

    const sortMap: Record<string, { col: string; asc: boolean }> = {
      name_asc: { col: "full_name", asc: true },
      name_desc: { col: "full_name", asc: false },
      last_stay_desc: { col: "last_stay", asc: false },
      last_stay_asc: { col: "last_stay", asc: true },
      total_stays_desc: { col: "total_stays", asc: false },
      lifetime_spend_desc: { col: "lifetime_spend", asc: false },
      created_desc: { col: "created_at", asc: false },
    };
    const s = sortMap[data.sort];
    query = query.order(s.col, { ascending: s.asc, nullsFirst: false });

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    query = query.range(from, to);

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        lifetime_spend: Number(r.lifetime_spend ?? 0),
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getGuestSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [
      { data: guest, error: gErr },
      { data: dir },
      { data: bookings },
      { data: assignments },
      { data: notes },
      { data: comms },
    ] = await Promise.all([
      sb.from("guests").select("*").eq("id", data.id).maybeSingle(),
      sb.from("guest_directory").select("*").eq("id", data.id).maybeSingle(),
      sb
        .from("bookings")
        .select(
          "id, reference, check_in, check_out, nights, adults, children, status, payment_status, total, currency, deposit_amount, balance_amount, paid_amount, room_id, created_at",
        )
        .eq("guest_id", data.id)
        .order("check_in", { ascending: false })
        .limit(100),
      sb.from("guest_tag_assignments").select("tag_id, assigned_at").eq("guest_id", data.id),
      sb
        .from("guest_notes")
        .select("id, body, author_id, created_at, updated_at, history, is_deleted")
        .eq("guest_id", data.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),
      sb
        .from("guest_communications")
        .select("*")
        .eq("guest_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(200),
    ]);
    if (gErr) throw new Error(gErr.message);
    if (!guest) throw new Error("Guest not found");

    const roomIds = Array.from(new Set((bookings ?? []).map((b: any) => b.room_id).filter(Boolean)));
    const { data: rooms } = roomIds.length
      ? await sb.from("rooms").select("id, name, slug").in("id", roomIds)
      : { data: [] as any[] };
    const roomMap = new Map((rooms ?? []).map((r: any) => [r.id, r]));

    const tagIds = (assignments ?? []).map((a: any) => a.tag_id);
    const { data: tags } = tagIds.length
      ? await sb.from("guest_tags").select("id, slug, label, color").in("id", tagIds)
      : { data: [] as any[] };

    // Reviews joined by email
    const { data: reviews } = guest.email
      ? await sb
          .from("reviews")
          .select("id, source, rating, title, body, guest_name, submitted_at, status, source_url")
          .ilike("guest_email", guest.email)
          .order("submitted_at", { ascending: false })
          .limit(50)
      : { data: [] as any[] };

    return {
      guest,
      stats: dir
        ? {
            total_stays: dir.total_stays,
            total_nights: dir.total_nights,
            lifetime_spend: Number(dir.lifetime_spend ?? 0),
            first_stay: dir.first_stay,
            last_stay: dir.last_stay,
            cancelled_count: dir.cancelled_count,
          }
        : null,
      bookings: (bookings ?? []).map((b: any) => ({
        ...b,
        total: Number(b.total),
        room: roomMap.get(b.room_id) ?? null,
      })),
      tags: tags ?? [],
      notes: notes ?? [],
      communications: comms ?? [],
      reviews: reviews ?? [],
    };
  });

export const getGuestTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: bookings }, { data: pay }, { data: emails }, { data: wa }, { data: comms }, { data: notes }] =
      await Promise.all([
        sb
          .from("bookings")
          .select("id, reference, status, created_at, confirmed_at, cancelled_at, check_in, check_out")
          .eq("guest_id", data.id),
        sb.from("payment_events").select("*").in(
          "booking_id",
          (
            (await sb.from("bookings").select("id").eq("guest_id", data.id)).data ?? []
          ).map((b: any) => b.id),
        ),
        sb.from("email_events").select("*").in(
          "booking_id",
          (
            (await sb.from("bookings").select("id").eq("guest_id", data.id)).data ?? []
          ).map((b: any) => b.id),
        ),
        sb.from("whatsapp_alerts").select("*").in(
          "booking_id",
          (
            (await sb.from("bookings").select("id").eq("guest_id", data.id)).data ?? []
          ).map((b: any) => b.id),
        ),
        sb.from("guest_communications").select("*").eq("guest_id", data.id),
        sb.from("guest_notes").select("*").eq("guest_id", data.id).eq("is_deleted", false),
      ]);

    type Entry = { at: string; type: string; title: string; description?: string; meta?: any };
    const entries: Entry[] = [];
    for (const b of bookings ?? []) {
      entries.push({ at: b.created_at, type: "booking_created", title: `Booking ${b.reference} created`, meta: { bookingId: b.id } });
      if (b.confirmed_at)
        entries.push({ at: b.confirmed_at, type: "booking_confirmed", title: `Booking ${b.reference} confirmed`, meta: { bookingId: b.id } });
      if (b.cancelled_at)
        entries.push({ at: b.cancelled_at, type: "booking_cancelled", title: `Booking ${b.reference} cancelled`, meta: { bookingId: b.id } });
    }
    for (const p of pay ?? [])
      entries.push({ at: p.created_at, type: `payment_${p.event_type ?? "event"}`, title: `Payment ${p.event_type ?? "event"}`, description: p.description ?? null, meta: p });
    for (const e of emails ?? [])
      entries.push({ at: e.occurred_at ?? e.created_at, type: `email_${e.event ?? "sent"}`, title: e.subject ?? `Email ${e.event ?? ""}`.trim(), meta: e });
    for (const w of wa ?? [])
      entries.push({ at: w.created_at, type: "whatsapp", title: w.template ?? "WhatsApp alert", description: w.body ?? null, meta: w });
    for (const c of comms ?? [])
      entries.push({ at: c.occurred_at, type: `comm_${c.channel}_${c.direction}`, title: c.subject ?? `${c.channel} ${c.direction}`, description: c.body, meta: c });
    for (const n of notes ?? [])
      entries.push({ at: n.created_at, type: "note", title: "Internal note", description: n.body, meta: { id: n.id } });

    entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return entries;
  });

// ---------- writes ----------

const updateGuestSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      full_name: z.string().trim().min(1).max(200).optional(),
      phone_e164: z.string().trim().max(40).nullable().optional(),
      country: z.string().trim().max(80).nullable().optional(),
      preferred_language: z.string().trim().max(40).nullable().optional(),
      nationality: z.string().trim().max(80).nullable().optional(),
      time_zone: z.string().trim().max(60).nullable().optional(),
      communication_preference: z.enum(["email", "whatsapp", "sms", "none"]).optional(),
      internal_notes: z.string().trim().max(2000).nullable().optional(),
      status: z.enum(["new", "returning", "vip"]).optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "No changes" }),
});

export const updateGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateGuestSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const patch: any = { ...data.patch };
    if (patch.status) patch.status_override = true;
    const { error } = await sb.from("guests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(sb, {
      actorId: context.userId,
      action: "guest.update",
      entityType: "guest",
      entityId: data.id,
      newValue: patch,
    });
    return { ok: true };
  });

// ----- notes -----

export const createGuestNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ guestId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("guest_notes")
      .insert({ guest_id: data.guestId, body: data.body, author_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateGuestNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: existing, error: eErr } = await sb
      .from("guest_notes")
      .select("body, history")
      .eq("id", data.id)
      .single();
    if (eErr) throw new Error(eErr.message);
    const history = Array.isArray(existing.history) ? existing.history : [];
    history.unshift({ at: new Date().toISOString(), author_id: context.userId, body: existing.body });
    const { error } = await sb
      .from("guest_notes")
      .update({ body: data.body, history })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGuestNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb
      .from("guest_notes")
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- tags -----

export const listGuestTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data, error } = await sb.from("guest_tags").select("*").order("label");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createGuestTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        label: z.string().trim().min(1).max(60),
        color: z.string().trim().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const slug = data.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    const { data: row, error } = await sb
      .from("guest_tags")
      .insert({ slug, label: data.label, color: data.color ?? null, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const assignGuestTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ guestId: z.string().uuid(), tagId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb
      .from("guest_tag_assignments")
      .upsert({ guest_id: data.guestId, tag_id: data.tagId, assigned_by: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unassignGuestTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ guestId: z.string().uuid(), tagId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb
      .from("guest_tag_assignments")
      .delete()
      .eq("guest_id", data.guestId)
      .eq("tag_id", data.tagId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- communications -----

export const logCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        guestId: z.string().uuid(),
        bookingId: z.string().uuid().nullish(),
        channel: z.enum(["email", "whatsapp", "sms", "note", "system", "call"]),
        direction: z.enum(["in", "out", "internal"]),
        subject: z.string().trim().max(200).nullish(),
        body: z.string().trim().max(8000).nullish(),
        occurredAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("guest_communications")
      .insert({
        guest_id: data.guestId,
        booking_id: data.bookingId ?? null,
        channel: data.channel,
        direction: data.direction,
        subject: data.subject ?? null,
        body: data.body ?? null,
        author_id: context.userId,
        occurred_at: data.occurredAt ?? new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ----- duplicates -----

export const findDuplicateGuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data, error } = await sb.rpc("find_duplicate_guests");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ----- dashboard widgets -----

export const getCrmDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [recent, returning, vip, arrivals] = await Promise.all([
      sb
        .from("guest_directory")
        .select("id, full_name, email, country, status, last_stay, total_stays, lifetime_spend")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("guest_directory")
        .select("id, full_name, email, country, status, last_stay, total_stays, lifetime_spend")
        .gte("total_stays", 2)
        .order("last_stay", { ascending: false, nullsFirst: false })
        .limit(5),
      sb
        .from("guest_directory")
        .select("id, full_name, email, country, status, last_stay, total_stays, lifetime_spend")
        .eq("status", "vip")
        .order("last_stay", { ascending: false, nullsFirst: false })
        .limit(5),
      sb
        .from("bookings")
        .select("id, reference, guest_name, guest_id, check_in, check_out, status")
        .gte("check_in", today)
        .lte("check_in", in7)
        .in("status", ["confirmed", "pending"])
        .order("check_in")
        .limit(10),
    ]);
    return {
      recent: recent.data ?? [],
      returning: returning.data ?? [],
      vip: vip.data ?? [],
      arrivals: arrivals.data ?? [],
    };
  });