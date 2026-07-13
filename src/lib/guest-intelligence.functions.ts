import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const idSchema = z.object({ id: z.string().uuid() });

// ---------- preferences ----------

export const listGuestPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rows, error } = await sb
      .from("guest_preferences")
      .select("*")
      .eq("guest_id", data.id)
      .order("category")
      .order("key");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const upsertPrefSchema = z.object({
  guestId: z.string().uuid(),
  category: z.enum(["room", "dining", "service", "accessibility", "other"]).default("other"),
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(400),
});

export const upsertGuestPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertPrefSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb.from("guest_preferences").upsert(
      {
        guest_id: data.guestId,
        category: data.category,
        key: data.key,
        value: data.value,
        source: "manual",
        updated_by: context.userId,
      },
      { onConflict: "guest_id,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGuestPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb.from("guest_preferences").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- metrics ----------

export const getGuestMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("guest_metrics")
      .select("*")
      .eq("guest_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    let favouriteRoom: { id: string; name: string } | null = null;
    if (row?.favourite_room_id) {
      const { data: r } = await sb.from("rooms").select("id, name").eq("id", row.favourite_room_id).maybeSingle();
      if (r) favouriteRoom = r;
    }
    return { ...(row ?? {}), favouriteRoom };
  });

// ---------- experiences (derived from booking_extras) ----------

export const getGuestExperiences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: bookings } = await sb
      .from("bookings")
      .select("id, reference, check_in, check_out")
      .eq("guest_id", data.id);
    const ids = (bookings ?? []).map((b: any) => b.id);
    if (ids.length === 0) return [];
    const { data: rows, error } = await sb
      .from("booking_extras")
      .select("id, booking_id, quantity, line_total, created_at, extra:extras(name, slug, unit, description)")
      .in("booking_id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const bMap = new Map((bookings ?? []).map((b: any) => [b.id, b]));
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      name: r.extra?.name ?? "Experience",
      slug: r.extra?.slug,
      quantity: r.quantity,
      line_total: Number(r.line_total ?? 0),
      booking: bMap.get(r.booking_id) ?? null,
      created_at: r.created_at,
    }));
  });

// ---------- payments (derived) ----------

export const getGuestPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: bookings } = await sb
      .from("bookings")
      .select("id, reference, total, paid_amount, balance_amount, currency, payment_status, invoice_number")
      .eq("guest_id", data.id);
    const ids = (bookings ?? []).map((b: any) => b.id);
    const { data: events } = ids.length
      ? await sb
          .from("payment_events")
          .select("*")
          .in("booking_id", ids)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };
    return { bookings: bookings ?? [], events: events ?? [] };
  });

// ---------- documents (stub) ----------

export const listGuestDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rows, error } = await sb
      .from("guest_documents")
      .select("*")
      .eq("guest_id", data.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- dashboard intelligence ----------

export const getDashboardIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const today = new Date();
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const [
      { data: vipArrivals },
      { data: birthdays },
      { data: anniversaries },
      { data: countries },
      { data: topLifetime },
      { data: acquisition },
    ] = await Promise.all([
      sb
        .from("bookings")
        .select("id, reference, guest_name, guest_id, check_in, guest:guests(status, full_name)")
        .eq("check_in", iso(today))
        .neq("status", "cancelled"),
      sb.from("guests").select("id, full_name, birthday").not("birthday", "is", null).eq("is_deleted", false),
      sb.from("guests").select("id, full_name, anniversary").not("anniversary", "is", null).eq("is_deleted", false),
      sb.from("guest_country_stats").select("*").order("guest_count", { ascending: false }).limit(10),
      sb
        .from("guest_directory")
        .select("id, full_name, country, total_stays, lifetime_spend, status")
        .order("lifetime_spend", { ascending: false, nullsFirst: false })
        .limit(20),
      sb
        .from("guests")
        .select("created_at")
        .gte("created_at", new Date(today.getTime() - 365 * 24 * 3600 * 1000).toISOString()),
    ]);

    const inNextWeek = (mmdd: string | null) => {
      if (!mmdd) return false;
      const d = new Date(mmdd);
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const norm = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      return norm >= start && norm <= end;
    };

    const trend = new Map<string, number>();
    for (const g of acquisition ?? []) {
      const k = String(g.created_at).slice(0, 7);
      trend.set(k, (trend.get(k) ?? 0) + 1);
    }
    const acquisitionTrend = Array.from(trend.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    return {
      vipArrivals: (vipArrivals ?? []).filter((b: any) => b.guest?.status === "vip"),
      birthdays: (birthdays ?? []).filter((g: any) => inNextWeek(g.birthday)),
      anniversaries: (anniversaries ?? []).filter((g: any) => inNextWeek(g.anniversary)),
      topCountries: countries ?? [],
      topLifetime: (topLifetime ?? []).map((r: any) => ({ ...r, lifetime_spend: Number(r.lifetime_spend ?? 0) })),
      acquisitionTrend,
    };
  });

// ---------- AI summary (stub – deterministic; wire Lovable AI later) ----------

export const generateGuestSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: guest }, { data: metrics }] = await Promise.all([
      sb.from("guests").select("full_name, country, communication_preference, status").eq("id", data.id).maybeSingle(),
      sb.from("guest_metrics").select("*").eq("guest_id", data.id).maybeSingle(),
    ]);
    if (!guest) throw new Error("Guest not found");
    const parts: string[] = [];
    parts.push(`${guest.full_name}${guest.country ? ` from ${guest.country}` : ""}.`);
    if (metrics?.stays) {
      parts.push(
        `${metrics.stays} stay${metrics.stays > 1 ? "s" : ""}, averaging ${metrics.avg_nights ?? 0} night${
          Number(metrics.avg_nights) === 1 ? "" : "s"
        } and $${Number(metrics.avg_spend ?? 0).toLocaleString()} per booking.`,
      );
    } else {
      parts.push("No completed stays yet.");
    }
    if (metrics?.is_repeat) parts.push("Repeat guest.");
    if (guest.status === "vip") parts.push("Currently flagged VIP.");
    if (metrics?.avg_lead_time_days) parts.push(`Books ~${metrics.avg_lead_time_days} days in advance.`);
    parts.push(`Preferred contact: ${guest.communication_preference}.`);
    const summary = parts.join(" ");
    const { error } = await sb
      .from("guests")
      .update({ ai_summary: summary, ai_summary_updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { summary };
  });

// ---------- guest profile writes (birthday / anniversary / marketing consent) ----------

const profileExtrasSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      birthday: z.string().nullable().optional(),
      anniversary: z.string().nullable().optional(),
      marketing_consent: z.boolean().optional(),
      avatar_url: z.string().url().nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "No changes" }),
});

export const updateGuestProfileExtras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileExtrasSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb.from("guests").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- smart-tag catalogue seeding (idempotent) ----------

const SMART_TAGS = [
  "VIP","Repeat Guest","Anniversary","Family","Corporate","Photographer",
  "Birdwatcher","Luxury Traveller","Adventure Traveller","Safari Extension",
  "Birthday","High Spender","Referral","Dietary Requirements",
];

export const ensureSmartTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const rows = SMART_TAGS.map((label) => ({
      label,
      slug: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    }));
    const { error } = await sb.from("guest_tags").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { seeded: rows.length };
  });