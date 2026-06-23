import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function getPublicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const availabilitySchema = z.object({
  checkIn: dateStr,
  checkOut: dateStr,
  guests: z.number().int().min(1).max(20).optional(),
});

export type AvailabilityRoom = {
  room_id: string;
  slug: string;
  name: string;
  base_price: number;
  currency: string;
  capacity_adults: number;
  capacity_children: number;
  max_occupancy: number;
  nights: number;
  nightly_total: number;
  min_available: number;
  is_available: boolean;
};

export const checkAvailability = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => availabilitySchema.parse(d))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) {
      throw new Error("Check-out must be after check-in");
    }
    const sb = getPublicClient();
    const { data: rows, error } = await sb.rpc("get_room_availability", {
      _check_in: data.checkIn,
      _check_out: data.checkOut,
    });
    if (error) throw new Error(error.message);
    const guests = data.guests ?? 1;
    const rooms = (rows ?? []) as AvailabilityRoom[];
    return rooms
      .map((r) => ({
        ...r,
        nightly_total: Number(r.nightly_total),
        base_price: Number(r.base_price),
        fits_guests: guests <= r.max_occupancy,
      }))
      .sort((a, b) => a.base_price - b.base_price);
  });

export const listExtras = createServerFn({ method: "GET" }).handler(async () => {
  const sb = getPublicClient();
  const { data, error } = await sb
    .from("extras")
    .select("id, slug, name, description, price, unit, currency, sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  const TRANSFER_SLUGS = new Set(["airport-transfer"]);
  return (data ?? []).map((e) => ({
    ...e,
    price: Number(e.price),
    category: TRANSFER_SLUGS.has(e.slug) ? ("transfers" as const) : ("experiences" as const),
  }));
});

const extraSchema = z.object({
  slug: z.string().min(1),
  quantity: z.number().int().min(1).max(20),
});

const createBookingSchema = z.object({
  roomSlug: z.string().min(1),
  checkIn: dateStr,
  checkOut: dateStr,
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10).optional(),
  childrenBelow6: z.number().int().min(0).max(10).optional(),
  children7Plus: z.number().int().min(0).max(10).optional(),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().trim().email().max(255),
  guestPhone: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  specialRequests: z.string().trim().max(1000).optional().or(z.literal("")),
  visitPurpose: z.string().trim().max(80).optional().or(z.literal("")),
  extras: z.array(extraSchema).max(20).default([]),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookingSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = getPublicClient();
    const below6 = data.childrenBelow6 ?? 0;
    const plus7 = data.children7Plus ?? Math.max(0, (data.children ?? 0) - below6);
    const totalChildren = below6 + plus7;
    const { data: result, error } = await sb.rpc("create_booking", {
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children: totalChildren,
      _children_below_6: below6,
      _children_7_plus: plus7,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: (data.guestPhone || null) as unknown as string,
      _country: (data.country || null) as unknown as string,
      _special_requests: (data.specialRequests || null) as unknown as string,
      _extras: data.extras,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    // Persist optional purpose-of-visit on the booking row (RPC doesn't accept it).
    const purpose = (data.visitPurpose || "").trim();
    if (purpose) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("bookings")
          .update({ visit_purpose: purpose } as never)
          .eq("id", row.booking_id as string);
      } catch (e) {
        console.error("booking visit_purpose update failed:", e);
      }
    }
    // Send "reservation received" email via Lovable Emails. Never let email failure block booking.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: full } = await supabaseAdmin
        .from("bookings")
        .select("reference, guest_name, guest_email, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, currency, room_id")
        .eq("id", row.booking_id as string)
        .maybeSingle();
      if (full) {
        const { data: room } = await supabaseAdmin.from("rooms").select("name").eq("id", full.room_id).maybeSingle();
        const { sendTransactionalInternal } = await import("./email/send-internal.server");
        const result = await sendTransactionalInternal({
          templateName: "booking-received",
          recipientEmail: full.guest_email,
          idempotencyKey: `booking-received-${row.booking_id}`,
          bookingId: row.booking_id as string,
          bcc: ["bookings@mtoniriverlodge.com"],
          templateData: {
            reference: full.reference,
            guestName: full.guest_name,
            roomName: room?.name,
            checkIn: full.check_in,
            checkOut: full.check_out,
            nights: full.nights,
            adults: full.adults,
            children: full.children ?? 0,
            total: full.total,
            deposit: full.deposit_amount,
            balance: full.balance_amount,
            currency: full.currency,
          },
        });
        if (!result.ok) console.error("booking email failed:", result);
      }
    } catch (e) {
      console.error("booking email error:", e);
    }
    return {
      bookingId: row.booking_id as string,
      reference: row.reference as string,
      total: Number(row.total),
      currency: row.currency as string,
    };
  });

export const getBookingByReference = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ reference: z.string().min(4), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data }) => {
    // Service-role read since bookings are staff-only via RLS; verify email match.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, reference, check_in, check_out, nights, adults, children, guest_name, guest_email, total, currency, status, payment_status, room_id",
      )
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.guest_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Booking not found");
    }
    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, slug")
      .eq("id", row.room_id)
      .maybeSingle();
    return { ...row, total: Number(row.total), room };
  });