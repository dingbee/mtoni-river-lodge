import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const listSchema = z.object({
  status: z.enum(["all", "pending", "confirmed", "cancelled", "completed", "no_show"]).default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    let q = context.supabase
      .from("bookings")
      .select("id, reference, guest_name, guest_email, check_in, check_out, nights, adults, children, total, currency, status, payment_status, created_at, room_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.from) q = q.gte("check_in", data.from);
    if (data.to) q = q.lte("check_in", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const { data: rooms } = await context.supabase.from("rooms").select("id, name, slug");
    const roomMap = new Map((rooms ?? []).map((r: any) => [r.id, r]));
    return (rows ?? []).map((b: any) => ({
      ...b,
      total: Number(b.total),
      room: roomMap.get(b.room_id) ?? null,
    }));
  });

export const getBookingDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: booking, error } = await context.supabase
      .from("bookings").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");
    const [{ data: nights }, { data: bExtras }, { data: room }] = await Promise.all([
      context.supabase.from("booking_nights").select("date, nightly_rate").eq("booking_id", data.id).order("date"),
      context.supabase.from("booking_extras").select("quantity, unit_price, line_total, extra_id").eq("booking_id", data.id),
      context.supabase.from("rooms").select("name, slug").eq("id", booking.room_id).maybeSingle(),
    ]);
    const extraIds = (bExtras ?? []).map((e: any) => e.extra_id);
    const { data: extras } = extraIds.length
      ? await context.supabase.from("extras").select("id, name").in("id", extraIds)
      : { data: [] as any[] };
    const extraMap = new Map((extras ?? []).map((e: any) => [e.id, e.name]));
    return {
      booking: { ...booking, total: Number(booking.total) },
      room,
      nights: (nights ?? []).map((n: any) => ({ ...n, nightly_rate: Number(n.nightly_rate) })),
      extras: (bExtras ?? []).map((e: any) => ({ ...e, name: extraMap.get(e.extra_id) ?? "Extra", unit_price: Number(e.unit_price), line_total: Number(e.line_total) })),
    };
  });

export const updateBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const patch: {
      status: typeof data.status;
      confirmed_at?: string;
      cancelled_at?: string;
    } = { status: data.status };
    if (data.status === "confirmed") patch.confirmed_at = new Date().toISOString();
    if (data.status === "cancelled") patch.cancelled_at = new Date().toISOString();
    const { error } = await context.supabase.from("bookings").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });