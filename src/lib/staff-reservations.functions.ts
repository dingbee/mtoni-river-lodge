// Staff-side reservation creation.
//
// This module contains NO booking, availability, pricing, allocation or
// payment logic of its own. It is a thin authenticated wrapper around the
// existing reservation engine:
//   - `create_booking` RPC          → allocation, pricing, nights, extras,
//                                     overbooking guard, calendar events,
//                                     guest linking (bookings_link_guest)
//   - `checkin_eligibility` RPC     → MOCI eligibility
//   - `checkin_ensure_for_booking`  → MOCI record/token
//   - `logActivity`                 → audit trail
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "@/lib/activity-log.server";

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped RPC surfaces, matching existing admin services */

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const STAFF_SOURCES = [
  "direct",
  "walk_in",
  "phone",
  "email",
  "whatsapp",
  "agent",
  "ota",
  "corporate",
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
  checkIn: dateStr,
  checkOut: dateStr,
  adults: z.number().int().min(1).max(10),
  childrenBelow6: z.number().int().min(0).max(10).default(0),
  children7Plus: z.number().int().min(0).max(10).default(0),
  status: z.enum(["pending", "confirmed"]).default("confirmed"),
  paymentStatus: z.enum(["unpaid", "deposit_paid", "paid"]).default("unpaid"),
  paymentMethod: z.string().trim().max(60).optional().or(z.literal("")),
  source: z.enum(STAFF_SOURCES).default("direct"),
  specialRequests: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateStaffReservationInput = z.input<typeof createSchema>;

/**
 * Creates a reservation through the existing booking engine, then applies the
 * staff-only lifecycle fields (status / source / payment state) and ensures a
 * MOCI record when the reservation is eligible. No guest email is sent.
 */
export const createStaffReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in");

    const sb: any = context.supabase;
    const below6 = data.childrenBelow6 ?? 0;
    const plus7 = data.children7Plus ?? 0;

    const { data: result, error } = await sb.rpc("create_booking", {
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children: below6 + plus7,
      _children_below_6: below6,
      _children_7_plus: plus7,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _extras: [],
      // disambiguates the overloaded RPC signature (latest overload)
      _hold_id: null,
      _session_id: null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.booking_id) throw new Error("Reservation could not be created");
    const bookingId = row.booking_id as string;

    // Staff lifecycle fields the public RPC does not accept.
    const patch: Record<string, unknown> = {
      source: data.source,
      status: data.status,
      payment_status: data.paymentStatus,
    };
    if (data.status === "confirmed") patch["confirmed_at"] = new Date().toISOString();
    if (data.paymentMethod) patch["payment_method"] = data.paymentMethod;
    if (data.notes) patch["notes"] = data.notes;
    const { error: patchError } = await sb.from("bookings").update(patch).eq("id", bookingId);
    if (patchError) throw new Error(patchError.message);

    // MOCI: create the check-in record/token when eligible. Never blocks.
    let checkin: { token: string | null; status: string | null; eligible: boolean } = {
      token: null,
      status: null,
      eligible: false,
    };
    try {
      const { data: elig } = await sb.rpc("checkin_eligibility", { _booking_id: bookingId });
      const eligible = Boolean(elig?.eligible);
      checkin.eligible = eligible;
      if (eligible) {
        const { data: ensured } = await sb.rpc("checkin_ensure_for_booking", {
          _booking_id: bookingId,
        });
        const c = Array.isArray(ensured) ? ensured[0] : ensured;
        if (c) checkin = { token: c.token, status: c.status, eligible: true };
      }
    } catch (e) {
      console.warn("[reservation] MOCI ensure skipped:", (e as Error).message);
    }

    await logActivity(sb, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "reservation.created",
      entityType: "booking",
      entityId: bookingId,
      entityLabel: row.reference as string,
      metadata: {
        channel: "staff_console",
        source: data.source,
        room_slug: data.roomSlug,
        check_in: data.checkIn,
        check_out: data.checkOut,
        status: data.status,
        payment_status: data.paymentStatus,
        guest_id: data.guestId ?? null,
        moci_created: Boolean(checkin.token),
      },
      newValue: { reference: row.reference, total: Number(row.total), currency: row.currency },
    });

    return {
      bookingId,
      reference: row.reference as string,
      total: Number(row.total),
      currency: row.currency as string,
      checkin,
    };
  });

/** Existing MOCI status/link for a reservation, for the detail panel. */
export const getReservationCheckinAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: elig, error } = await sb.rpc("checkin_eligibility", {
      _booking_id: data.bookingId,
    });
    if (error) throw new Error(error.message);
    const eligible = Boolean(elig?.eligible);
    const { data: existing } = await sb
      .from("guest_checkins")
      .select("token, status, expires_at, submitted_at")
      .eq("booking_id", data.bookingId)
      .maybeSingle();
    return {
      eligible,
      reason: (elig?.message ?? elig?.code ?? null) as string | null,
      token: existing?.token ?? null,
      status: existing?.status ?? null,
      expiresAt: existing?.expires_at ?? null,
    };
  });

/** Idempotently ensures the MOCI record via the existing RPC. */
export const ensureReservationCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: ensured, error } = await sb.rpc("checkin_ensure_for_booking", {
      _booking_id: data.bookingId,
    });
    if (error) throw new Error(error.message);
    const c = Array.isArray(ensured) ? ensured[0] : ensured;
    if (!c) throw new Error("Check-in could not be prepared for this reservation");
    return { token: c.token as string, status: c.status as string, expiresAt: c.expires_at };
  });
