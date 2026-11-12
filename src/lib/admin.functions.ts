import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function requireActiveReservationProperty(supabase: any, userId: string): Promise<string> {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", {
    _uid: userId,
  });
  if (error || !propertyId) throw new Error("Select an active property first.");

  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access",
    { _uid: userId, _property_id: propertyId },
  );
  if (accessError || !allowed) throw new Error("You do not have access to the active property.");

  return String(propertyId);
}

const listSchema = z.object({
  status: z.enum(["all", "pending", "confirmed", "checked_in", "cancelled", "completed", "no_show"]).default("all"),
  paymentStatus: z.enum(["all", "unpaid", "deposit_paid", "paid", "refunded"]).default("all"),
  from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
});

export const listBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    const propertyId = await requireActiveReservationProperty(context.supabase, context.userId);
    let q = context.supabase
      .from("bookings")
      .select("id, reference, guest_name, guest_email, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, paid_amount, currency, status, payment_status, payment_method, created_at, room_id")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.paymentStatus !== "all") q = q.eq("payment_status", data.paymentStatus);
    if (data.from) q = q.gte("check_in", data.from);
    if (data.to) q = q.lte("check_in", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const { data: rooms } = await context.supabase
      .from("rooms")
      .select("id, name, slug")
      .eq("property_id", propertyId);
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    const propertyId = await requireActiveReservationProperty(context.supabase, context.userId);
    const { data: booking, error } = await context.supabase
      .from("bookings")
      .select("*")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found in the active property.");
    const [{ data: nights }, { data: bExtras }, { data: room }] = await Promise.all([
      context.supabase.from("booking_nights").select("date, nightly_rate").eq("booking_id", data.id).order("date"),
      context.supabase.from("booking_extras").select("quantity, unit_price, line_total, extra_id").eq("booking_id", data.id),
      context.supabase.from("rooms").select("name, slug").eq("id", booking.room_id).eq("property_id", propertyId).maybeSingle(),
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
      status: z.enum(["confirmed", "checked_in", "cancelled", "completed", "no_show"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    const propertyId = await requireActiveReservationProperty(context.supabase, context.userId);
    const { data: booking, error: bookingError } = await context.supabase
      .from("bookings")
      .select("id")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (bookingError) throw new Error(bookingError.message);
    if (!booking) throw new Error("Booking not found in the active property.");
    const { data: result, error } = await context.supabase.rpc("staynas_transition_booking", {
      _booking_id: data.id,
      _target_status: data.status,
      _notes: null,
    });
    if (error) throw new Error(error.message);
    if (data.status !== "checked_in") return result ?? { ok: true };

    let guestPortalAccess: {
      issued: boolean;
      alreadyActive: boolean;
      expiresAt: string | null;
      accessId: string;
      token?: string | null;
      error?: string;
    } = { issued: false, alreadyActive: false, expiresAt: null, accessId: "" };

    try {
      const { ensureGuestPortalAccessAfterCheckIn } = await import(
        "@/domains/hospitality/guest-portal/guest-portal-access.server"
      );
      const issued = await ensureGuestPortalAccessAfterCheckIn(
        context.supabase,
        context.userId,
        data.id,
      );
      guestPortalAccess = {
        issued: issued.issued,
        alreadyActive: issued.alreadyActive,
        expiresAt: issued.expiresAt,
        accessId: issued.accessId,
        token: issued.issued ? issued.token : null,
      };
    } catch {
      guestPortalAccess = {
        issued: false,
        alreadyActive: false,
        expiresAt: null,
        accessId: "",
        error: "Check-in succeeded, but Guest Portal access issuance failed. Retry from the reservation access panel.",
      };
    }
    return { ...(result !== null && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : { ok: true }), guestPortalAccess };
  });
