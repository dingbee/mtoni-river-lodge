// Staff-side reservation creation.
//
// This module contains NO booking, availability, pricing, allocation or
// payment logic of its own. It is a thin authenticated wrapper around the
// existing reservation engine:
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped RPC surfaces, matching existing admin services */

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const STAFF_SOURCES = [
  "direct", "walk_in", "phone", "email", "whatsapp", "agent", "ota", "corporate",
] as const;

export const RESERVATION_SOURCES = STAFF_SOURCES;

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const createSchema = z.object({
  guestId: z.string().uuid().optional(),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().trim().email().max(255),
  guestPhone: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  roomSlug: z.string().min(1).max(80),
  ratePlanId: z.string().uuid().optional(),
  promoCode: z.string().trim().max(64).optional().or(z.literal("")),
  extras: z.array(z.object({ slug: z.string().min(1).max(80), quantity: z.number().int().min(1).max(20) })).max(20).default([]),
  paymentMethod: z.enum(["online", "pay_at_property"]).default("online"),
  checkIn: dateStr,
  checkOut: dateStr,
  adults: z.number().int().min(1).max(10),
  childrenBelow6: z.number().int().min(0).max(10).default(0),
  children7Plus: z.number().int().min(0).max(10).default(0),
  status: z.enum(["pending", "confirmed"]).default("pending"),
  source: z.enum(STAFF_SOURCES).default("direct"),
  specialRequests: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateStaffReservationInput = z.input<typeof createSchema>;

export const createStaffReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in");

    const sb: any = context.supabase;
    const below6 = data.childrenBelow6 ?? 0;
    const plus7 = data.children7Plus ?? 0;

    // Resolve property from the authenticated staff context, then perform all
    // privileged booking writes through the server-only service client.
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;

    const { data: quote, error: quoteError } = await admin.rpc("staynas_create_reservation_quote", {
      _property_id: propertyId,
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children_below_6: below6,
      _children_7_plus: plus7,
      _extras: data.extras,
      _rate_plan_id: data.ratePlanId ?? null,
      _promo_code: data.promoCode?.trim() || null,
      _guest_email: data.guestEmail,
      _ttl_seconds: 600,
    });
    if (quoteError) throw new Error(quoteError.message);
    if (!quote?.quote_id) {
      throw new Error(`Staff reservation quote rejected [${quote?.error_code ?? "QUOTE_FAILED"}]: ${quote?.message ?? "Pricing could not be resolved"}`);
    }

    const { data: result, error } = await admin.rpc("staynas_create_reservation_from_quote", {
      _quote_id: quote.quote_id,
      _property_id: propertyId,
      _idempotency_key: quote.quote_id,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _payment_method: data.paymentMethod,
      _source: data.source,
      _hold_id: null,
      _session_id: null,
      _target_status: data.status,
      _actor_id: context.userId,
      _visit_purpose: null,
      _notes: data.notes || null,
    });
    if (error) throw new Error(error.message);
    if (result?.ok === false) {
      throw new Error(`Staff reservation rejected [${result.error_code ?? "RESERVATION_REJECTED"}]: ${result.message ?? "The reservation could not be created"}`);
    }
    if (!result?.booking_id) throw new Error("Reservation could not be created");
    const bookingId = result.booking_id as string;
    const reference = result.reference as string;
    const total = Number(result.total);
    const currency = result.currency as string;

    let checkin: { token: string | null; status: string | null; eligible: boolean } = {
      token: null, status: null, eligible: false,
    };
    try {
      const { data: elig } = await sb.rpc("checkin_eligibility", { _booking_id: bookingId });
      const eligible = Boolean(elig?.eligible);
      checkin.eligible = eligible;
      if (eligible) {
        const { data: ensured } = await sb.rpc("checkin_ensure_for_booking", { _booking_id: bookingId });
        const c = Array.isArray(ensured) ? ensured[0] : ensured;
        if (c) checkin = { token: c.token, status: c.status, eligible: true };
      }
    } catch (e) {
      console.warn("[reservation] MOCI ensure skipped:", (e as Error).message);
    }

    return { bookingId, reference, total, currency, checkin };
  });

export const getReservationCheckinAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: elig, error } = await sb.rpc("checkin_eligibility", { _booking_id: data.bookingId });
    if (error) throw new Error(error.message);
    const eligible = Boolean(elig?.eligible);
    const { data: existing } = await sb.from("guest_checkins").select("token, status, expires_at, submitted_at").eq("booking_id", data.bookingId).maybeSingle();
    const { data: arrivalPass } = await sb
      .from("arrival_passes")
      .select("token, status, expires_at")
      .eq("booking_id", data.bookingId)
      .eq("status", "active")
      .maybeSingle();
    return {
      eligible,
      reason: (elig?.message ?? elig?.code ?? null) as string | null,
      token: existing?.token ?? null,
      status: existing?.status ?? null,
      expiresAt: existing?.expires_at ?? null,
      arrivalPassToken: arrivalPass?.token ?? null,
      arrivalPassExpiresAt: arrivalPass?.expires_at ?? null,
    };
  });

export const ensureReservationCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: ensured, error } = await sb.rpc("checkin_ensure_for_booking", { _booking_id: data.bookingId });
    if (error) throw new Error(error.message);
    const c = Array.isArray(ensured) ? ensured[0] : ensured;
    if (!c) throw new Error("Check-in could not be prepared for this reservation");
    return { token: c.token as string, status: c.status as string, expiresAt: c.expires_at };
  });
