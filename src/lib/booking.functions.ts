import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { bookingRpc } from "@/lib/booking-rpc";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";
import { assertSameProperty } from "@/lib/booking-property";
import { buildPriceBreakdownFromConfig } from "@/lib/pricing";

async function getVerifiedOnlineProvider(supabaseAdmin: any, propertyId: string, currency: string): Promise<string | null> {
  const { data, error } = await (supabaseAdmin as any).from("staynas_property_integrations")
    .select("provider, credential_reference, supported_currencies")
    .eq("property_id", propertyId)
    .eq("purpose", "payments")
    .eq("enabled", true)
    .eq("verification_status", "verified")
    .not("credential_reference", "is", null)
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error("Could not resolve a verified property payment provider");
  const normalizedCurrency = String(currency ?? "").toUpperCase();
  const integration = (data ?? []).find((item: any) => {
    const supported = Array.isArray(item.supported_currencies) ? item.supported_currencies.map((v: string) => String(v).toUpperCase()) : [];
    return !normalizedCurrency || supported.length === 0 || supported.includes(normalizedCurrency);
  });
  return integration?.provider ? String(integration.provider) : null;
}


function getPublicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
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
  included_guests: number;
  extra_guest_fee: number;
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
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { data: rows, error } = await bookingRpc(sb).rpc("get_room_availability_for_property", {
      _property_id: propertyId,
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
  const propertyId = await getConfiguredBookingPropertyId(sb);
  // Generated types predate the property hardening; query through an
  // untyped alias so the property filter compiles against stale types.
  const { data, error } = await (sb as any)
    .from("extras")
    .select("id, slug, name, description, price, unit, currency, sort_order")
    .eq("active", true)
    .eq("property_id", propertyId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  const TRANSFER_SLUGS = new Set(["airport-transfer"]);
  return ((data ?? []) as any[]).map((e) => ({
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
  extras: z.array(extraSchema).max(20).default([]).refine((items) => new Set(items.map((item) => item.slug)).size === items.length, "Duplicate extras are not allowed"),
  holdId: z.string().uuid().optional(),
  sessionId: z.string().min(6).max(120).optional(),
  paymentMethod: z.enum(["online", "pay_at_property"]).default("online"),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookingSchema.parse(d))
  .handler(async ({ data }) => {
    const sb = getPublicClient();
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const below6 = data.childrenBelow6 ?? 0;
    const plus7 = data.children7Plus ?? Math.max(0, (data.children ?? 0) - below6);
    const totalChildren = below6 + plus7;
    if (data.paymentMethod === "online") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: room, error: roomError } = await (supabaseAdmin as any).from("rooms")
        .select("currency").eq("property_id", propertyId).eq("slug", data.roomSlug).maybeSingle();
      if (roomError || !room) throw new Error("Selected room could not be resolved for online payment");
      const verifiedProvider = await getVerifiedOnlineProvider(supabaseAdmin, propertyId, room.currency);
      if (!verifiedProvider) throw new Error("Online payment is not enabled for this property and currency. Choose Pay at Property.");
    }
    const { data: result, error } = await bookingRpc(sb).rpc("create_booking_for_property", {
      _property_id: propertyId,
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children: totalChildren,
      _children_below_6: below6,
      _children_7_plus: plus7,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _extras: data.extras,
      ...(data.holdId ? { _hold_id: data.holdId } : {}),
      ...(data.sessionId ? { _session_id: data.sessionId } : {}),
      _payment_method: data.paymentMethod,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row) throw new Error("Booking could not be created");
    // Persist optional purpose-of-visit on the booking row (RPC doesn't accept it).
    const purpose = (data.visitPurpose || "").trim();
    if (purpose) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("bookings")
          .update({ visit_purpose: purpose } as never)
          .eq("id", row.booking_id as string)
          .eq("property_id", propertyId);
      } catch (e) {
        console.error("booking visit_purpose update failed:", e);
      }
    }
    // Send "reservation received" email via Lovable Emails. Never let email failure block booking.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: full } = await supabaseAdmin
        .from("bookings")
        .select("reference, guest_name, guest_email, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, taxes, tax_addition, tax_breakdown, payment_method, currency, room_id")
        .eq("id", row.booking_id as string)
        .eq("property_id", propertyId)
        .maybeSingle();
      if (full) {
        const { data: room } = await supabaseAdmin.from("rooms").select("name").eq("id", full.room_id).eq("property_id", propertyId).maybeSingle();
        const { sendTransactionalInternal } = await import("./email/send-internal.server");
        const result = await sendTransactionalInternal({
          templateName: "booking-received",
          recipientEmail: full.guest_email,
          idempotencyKey: `booking-received-${row.booking_id}`,
          bookingId: row.booking_id as string,
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
            taxes: full.taxes,
            paymentMethod: full.payment_method ?? "online",
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
      taxes: Number(row.taxes ?? 0),
      taxAddition: Number(row.tax_addition ?? 0),
      taxBreakdown: Array.isArray(row.tax_breakdown) ? row.tax_breakdown : [],
    };
  });



/** Public booking methods are resolved from the current property, never global provider defaults. */
export const getBookingPaymentOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
  const { data: property, error } = await (supabaseAdmin as any).from("staynas_properties")
    .select("currency").eq("id", propertyId).maybeSingle();
  if (error || !property) throw new Error("Could not load property payment options");
  const onlineProvider = await getVerifiedOnlineProvider(supabaseAdmin, propertyId, property.currency);
  return { payAtProperty: true, online: Boolean(onlineProvider), onlineProvider };
});


const bookingTaxPreviewSchema = z.object({
  roomSlug: z.string().min(1).max(120),
  checkIn: dateStr,
  checkOut: dateStr,
  adults: z.number().int().min(1).max(10),
  childrenBelow6: z.number().int().min(0).max(10).default(0),
  children7Plus: z.number().int().min(0).max(10).default(0),
  extras: z.array(extraSchema).max(20).default([]).refine((items) => new Set(items.map((item) => item.slug)).size === items.length, "Duplicate extras are not allowed"),
});

/** Preview tax using the same database function used inside create_booking_for_property. */
export const getBookingTaxPreview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bookingTaxPreviewSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const nights = Math.round((Date.parse(data.checkOut) - Date.parse(data.checkIn)) / 86_400_000);
    if (!Number.isFinite(nights) || nights < 1 || nights > 365) throw new Error("Select a valid check-in and check-out date");

    const { data: room, error: roomError } = await (supabaseAdmin as any).from("rooms")
      .select("base_price,included_guests,max_occupancy,extra_guest_fee,currency")
      .eq("property_id", propertyId).eq("slug", data.roomSlug).maybeSingle();
    if (roomError || !room) throw new Error("Selected room could not be resolved for pricing");

    const accommodationSubtotal = Math.round(buildPriceBreakdownFromConfig({
      basePrice: Number(room.base_price),
      includedGuests: Number(room.included_guests),
      maxGuests: Number(room.max_occupancy),
      extraGuestFee: Number(room.extra_guest_fee),
      currency: String(room.currency),
    }, {
      adults: data.adults,
      childrenBelow6: data.childrenBelow6,
      children7Plus: data.children7Plus,
    }, nights).grandTotal * 100) / 100;

    let extrasTotal = 0;
    if (data.extras.length > 0) {
      const slugs = data.extras.map((item) => item.slug);
      const { data: extraRows, error: extrasError } = await (supabaseAdmin as any).from("extras")
        .select("slug,price,unit,currency")
        .eq("property_id", propertyId).eq("active", true).in("slug", slugs);
      if (extrasError) throw new Error("Unable to resolve selected booking extras");
      const bySlug = new Map((extraRows ?? []).map((item: any) => [String(item.slug), item]));
      if (bySlug.size !== slugs.length) throw new Error("One or more selected extras are no longer available");
      const occupants = data.adults + data.childrenBelow6 + data.children7Plus;
      for (const selection of data.extras) {
        const extra = bySlug.get(selection.slug) as any;
        if (extra.currency && String(extra.currency).toUpperCase() !== String(room.currency).toUpperCase()) {
          throw new Error("Selected extra currency does not match the room currency");
        }
        const multiplier = extra.unit === "per_stay" ? 1
          : extra.unit === "per_night" ? nights
          : extra.unit === "per_person" ? occupants
          : extra.unit === "per_person_per_night" ? occupants * nights : 1;
        extrasTotal += Number(extra.price) * selection.quantity * multiplier;
      }
      extrasTotal = Math.round(extrasTotal * 100) / 100;
    }

    const { data: result, error } = await (supabaseAdmin as any).rpc("calculate_staynas_booking_taxes", {
      _property_id: propertyId,
      _service_date: data.checkIn,
      _nights: nights,
      _accommodation_subtotal: accommodationSubtotal,
      _extras_total: extrasTotal,
      _currency: String(room.currency).toUpperCase(),
    });
    if (error) throw new Error(`Could not calculate property taxes: ${error.message}`);
    return {
      accommodationSubtotal,
      extrasTotal,
      taxTotal: Number(result?.tax_total ?? 0),
      taxAddition: Number(result?.tax_addition ?? 0),
      configured: Boolean(result?.configured),
      breakdown: Array.isArray(result?.breakdown) ? result.breakdown.map((line: any) => ({
        name: String(line.name ?? "Tax"), amount: Number(line.amount ?? 0),
        inclusive: Boolean(line.inclusive), added_to_total: Number(line.added_to_total ?? 0),
      })) : [],
    };
  });

export const getBookingByReference = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ reference: z.string().min(4), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data }) => {
    // Service-role read since bookings are staff-only via RLS; verify email match.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const { data: row, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select(
        "id, reference, check_in, check_out, nights, adults, children, guest_name, guest_email, total, currency, status, payment_status, room_id, property_id",
      )
      .eq("reference", data.reference)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.guest_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Booking not found");
    }
    // Never surface a booking outside the configured booking property.
    assertSameProperty(row.property_id, propertyId, "Booking");
    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, slug")
      .eq("id", row.room_id)
      .eq("property_id", propertyId)
      .maybeSingle();
    return { ...row, total: Number(row.total), room };
  });