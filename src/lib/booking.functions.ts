/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase RPC surface uses runtime contracts not yet represented in generated database types */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameProperty } from "@/lib/booking-property";
import { resolvePublicDirectBookingChannel } from "@/lib/public-booking-channel.server";


const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const availabilitySchema = z.object({
  checkIn: dateStr,
  checkOut: dateStr,
  guests: z.number().int().min(1).max(20).optional(),
  adults: z.number().int().min(1).max(10).default(1),
  childrenBelow6: z.number().int().min(0).max(10).default(0),
  children7Plus: z.number().int().min(0).max(10).default(0),
  ratePlanId: z.string().uuid().optional(),
});

export type PublicRatePlanOption = { rate_plan_id: string; name: string; description: string | null; meal_plan: string | null; refundable: boolean; currency: string; total: number; average_nightly_rate: number; minimum_stay: number; nightly_breakdown: Array<{ date: string; nightly_rate: number; currency: string; source_label: string; pricing_basis: string; source_rate: number }>; publication_id: string; publication_number: number; rate_plan_version: number; snapshot_hash: string };

export type AvailabilityRoom = {
  rate_plan_options?: PublicRatePlanOption[];
  selected_rate_plan_id?: string;
  selected_rate_plan?: PublicRatePlanOption;
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
  fits_occupancy: boolean;
  pricing_quote: BookingPricingQuote | null;
};

export type BookingPricingQuote = {
  quote_id?: string;
  quote_hash?: string;
  quote_expires_at?: string;
  ok?: boolean;
  error_code?: string;
  message?: string;
  pricing_evidence?: Record<string, string | number | null>;
  property_id: string;
  room_id: string;
  currency: string;
  check_in: string;
  check_out: string;
  nights: number;
  nightly: Array<{
    date: string;
    base_rate: number;
    occupancy_surcharge: number;
    adjustment: number;
    nightly_rate: number;
    currency: string;
    applied_rule_id: string | null;
    applied_rule_type: string | null;
    source?: string;
    source_rate?: number;
    pricing_basis?: string;
  }>;
  accommodation_subtotal: number;
  extras: Array<{ slug: string; name: string; quantity: number; unit_price: number; unit: string; line_total: number; currency: string }>;
  extras_total: number;
  taxes: number;
  tax_addition: number;
  tax_breakdown: Array<Record<string, string | number | boolean | null>>;
  total: number;
  deposit_amount: number;
  balance_due: number;
  minimum_stay: number;
  occupants: number;
  paid_occupants: number;
  extra_occupants: number;
  fee_total?: number;
  fees?: Array<Record<string, string | number | boolean | null>>;
  discount_total?: number;
  promotion?: Record<string, string | number | null> | null;
};

export const checkAvailability = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => availabilitySchema.parse(d))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) {
      throw new Error("Check-out must be after check-in");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const propertyId = channel.propertyId;
    const { data: rows, error } = await (supabaseAdmin as any).rpc("get_staynas_room_availability_priced_with_rate_plan", {
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _property_id: propertyId,
      _adults: data.adults,
      _children_below_6: data.childrenBelow6,
      _children_7_plus: data.children7Plus,
      _rate_plan_id: data.ratePlanId ?? null,
    });
    if (error) throw new Error(error.message);
    const mapped = await Promise.all(((rows ?? []) as any[]).map(async (r) => {
      if (String(r.currency ?? "").toUpperCase() !== channel.currency) {
        throw new Error("Room currency does not match the published direct-booking channel");
      }
      let ratePlanOptions: PublicRatePlanOption[] = [];
      if (r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" || r.pricing_quote?.pricing_evidence?.rate_plan_id) {
        const { data: discovery, error: discoveryError } = await (supabaseAdmin as any).rpc("discover_staynas_public_rate_plans", {
          _property_id: propertyId, _room_id: r.room_id, _check_in: data.checkIn, _check_out: data.checkOut,
          _adults: data.adults, _children_below_6: data.childrenBelow6, _children_7_plus: data.children7Plus,
        });
        if (!discoveryError && discovery?.ok) {
          ratePlanOptions = (discovery.plans ?? []) as PublicRatePlanOption[];
          if (ratePlanOptions.some((plan) => plan.currency !== channel.currency)) {
            throw new Error("Published rate-plan currency does not match the direct-booking channel");
          }
        }
      }
      return {
      ...r,
      rate_plan_options: ratePlanOptions,
      nightly_total: Number(r.nightly_total),
      base_price: Number(r.base_price),
      extra_guest_fee: Number(r.extra_guest_fee),
      pricing_quote: r.pricing_quote as BookingPricingQuote | null,
    };
    }));
    return mapped;
  });

export const listExtras = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const channel = await resolvePublicDirectBookingChannel(sb);
  const propertyId = channel.propertyId;
  // Generated types predate the property hardening; query through an
  // untyped alias so the property filter compiles against stale types.
  const { data, error } = await (sb as any)
    .from("extras")
    .select("id, slug, name, description, price, unit, currency, sort_order")
    .eq("active", true)
    .eq("property_id", propertyId)
    .eq("currency", channel.currency)
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
  quoteId: z.string().uuid(),
  roomSlug: z.string().min(1),
  ratePlanId: z.string().uuid().optional(),
  promoCode: z.string().trim().max(64).optional().or(z.literal("")),
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
  holdId: z.string().uuid().optional(),
  sessionId: z.string().min(6).max(120).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const getBookingQuote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    roomSlug: z.string().min(1),
    ratePlanId: z.string().uuid().optional(),
    promoCode: z.string().trim().max(64).optional().or(z.literal("")),
    guestEmail: z.string().trim().email().max(255).optional(),
    checkIn: dateStr,
    checkOut: dateStr,
    adults: z.number().int().min(1).max(10),
    childrenBelow6: z.number().int().min(0).max(10).default(0),
    children7Plus: z.number().int().min(0).max(10).default(0),
    extras: z.array(extraSchema).max(20).default([]),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const { data: quote, error } = await (supabaseAdmin as any).rpc("staynas_create_public_channel_quote", {
      _sales_channel_id: channel.channelId,
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children_below_6: data.childrenBelow6,
      _children_7_plus: data.children7Plus,
      _extras: data.extras,
      _rate_plan_id: data.ratePlanId ?? null,
      _promo_code: data.promoCode?.trim() || null,
      _guest_email: data.guestEmail?.trim() || null,
      _ttl_seconds: 600,
    });
    if (error) throw new Error(error.message);
    if (!quote) throw new Error("Pricing quote could not be calculated");
    if (quote.ok === false) {
      throw new Error(`Pricing rejected [${quote.error_code ?? "INVALID_RATE_CONFIGURATION"}]: ${quote.message ?? "Pricing configuration is invalid"}`);
    }
    return quote as BookingPricingQuote;
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookingSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb: any = supabaseAdmin;
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const { data: result, error } = await sb.rpc("staynas_create_public_channel_reservation", {
      _sales_channel_id: channel.channelId,
      _quote_id: data.quoteId,
      _idempotency_key: data.quoteId,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _payment_method: "online",
      _source: "website",
      _hold_id: data.holdId ?? null,
      _session_id: data.sessionId ?? null,
      _target_status: "pending",
      _actor_id: null,
      _visit_purpose: data.visitPurpose || null,
      _notes: null,
    });
    if (error) throw new Error(error.message);
    if (result?.ok === false) {
      const code = String(result.error_code ?? "RESERVATION_REJECTED");
      const message = String(result.message ?? "The reservation could not be created");
      const staleError = new Error(`[${code}] ${message}`);
      Object.assign(staleError, { code, currentQuote: result.current_quote ?? null });
      throw staleError;
    }
    const row = result as { booking_id?: string; reference?: string; total?: number; currency?: string };
    if (!row?.booking_id) throw new Error("Booking could not be created");
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
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const propertyId = channel.propertyId;
    const { data: row, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select(
        "id, reference, check_in, check_out, nights, adults, children, guest_name, guest_email, total, currency, status, payment_status, room_id, property_id, sales_channel_id",
      )
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.guest_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Booking not found");
    }
    // Never surface a booking outside the configured booking property.
    assertSameProperty(row.property_id, propertyId, "Booking");
    if (row.sales_channel_id !== channel.channelId) throw new Error("Booking does not belong to this direct-booking channel");
    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, slug")
      .eq("id", row.room_id)
      .maybeSingle();
    return { ...row, total: Number(row.total), room };
  });