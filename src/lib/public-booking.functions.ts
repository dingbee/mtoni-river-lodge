import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// First controlled Public Booking Network demo. Keep the UAT property allowlist
// explicit until StayNas has a property-level publication/visibility setting.
const PUBLIC_DEMO_PROPERTY_SLUGS = new Set(["nolmark-cdma-staynas"]);

async function resolvePublicDemoProperty(propertySlug: string) {
  if (!PUBLIC_DEMO_PROPERTY_SLUGS.has(propertySlug)) {
    throw new Error("This property booking page is not published.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_properties")
    .select("id, slug, name, currency, timezone, status")
    .eq("slug", propertySlug)
    .maybeSingle();

  if (error) throw new Error("Unable to load this property.");
  if (!data || data.status !== "active") throw new Error("This property is not available for online reservations.");

  return { property: data, supabaseAdmin };
}

const propertySlugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getPublicDemoProperty = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ propertySlug: propertySlugSchema }).parse(value))
  .handler(async ({ data }) => {
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug);
    const { data: rooms, error } = await (supabaseAdmin as any)
      .from("rooms")
      .select("id, slug, name, short_description, bed_label, bathroom_label, amenities, max_occupancy, total_units, base_price, currency, included_guests, extra_guest_fee")
      .eq("property_id", property.id)
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    const { data: brandingRow, error: brandingError } = await (supabaseAdmin as any)
      .from("staynas_property_branding")
      .select("logo_url, logo_dark_url, favicon_url, primary_color, secondary_color, background_color, text_color, tagline, description, hero_image_url, gallery_image_urls, show_staynas_attribution")
      .eq("property_id", property.id)
      .maybeSingle();
    if (brandingError) {
      console.error("[StayNas public booking] Property branding query failed", {
        code: brandingError.code, propertyId: property.id,
      });
      throw new Error("Unable to load property presentation.");
    }
    const branding = brandingRow ?? {};

    if (error) {
      // Log only safe PostgREST diagnostics; never log credentials or guest data.
      console.error("[StayNas public booking] Room catalogue query failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        propertyId: property.id,
      });
      throw new Error("Unable to load room information. Please try again later.");
    }

    return {
      property: {
        slug: property.slug,
        name: property.name,
        currency: property.currency,
        timezone: property.timezone,
      },
      branding: {
        logoUrl: branding.logo_url ?? "",
        logoDarkUrl: branding.logo_dark_url ?? "",
        faviconUrl: branding.favicon_url ?? "",
        primaryColor: branding.primary_color ?? "#1e352a",
        secondaryColor: branding.secondary_color ?? "#c6a878",
        backgroundColor: branding.background_color ?? "#f5f4ef",
        textColor: branding.text_color ?? "#202820",
        tagline: branding.tagline ?? "",
        description: branding.description ?? "",
        heroImageUrl: branding.hero_image_url ?? "",
        galleryImageUrls: Array.isArray(branding.gallery_image_urls) ? branding.gallery_image_urls : [],
        showStayNasAttribution: branding.show_staynas_attribution ?? true,
      },
      rooms: (rooms ?? []).map((room: any) => ({
        ...room,
        base_price: Number(room.base_price),
        extra_guest_fee: Number(room.extra_guest_fee ?? 0),
      })),
      demo: true,
      paymentEnabled: false,
    };
  });

const availabilitySchema = z.object({
  propertySlug: propertySlugSchema,
  checkIn: dateSchema,
  checkOut: dateSchema,
  guests: z.number().int().min(1).max(8),
  ratePlanId: z.string().uuid().optional(),
});

export const searchPublicDemoAvailability = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => availabilitySchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug);
    const { data: rows, error } = await (supabaseAdmin as any).rpc("get_staynas_room_availability_priced_with_rate_plan", {
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _property_id: property.id,
      _adults: data.guests,
      _children_below_6: 0,
      _children_7_plus: 0,
      _rate_plan_id: data.ratePlanId ?? null,
    });
    if (error) throw new Error(error.message);
    const ratePlanChoices = await Promise.all((rows ?? []).filter((room: any) => room.pricing_quote?.error_code === "RATE_PLAN_REQUIRED").map(async (room: any) => {
      const { data: discovery, error: discoveryError } = await (supabaseAdmin as any).rpc("discover_staynas_public_rate_plans", {
        _property_id: property.id, _room_id: room.room_id, _check_in: data.checkIn, _check_out: data.checkOut,
        _adults: data.guests, _children_below_6: 0, _children_7_plus: 0,
      });
      return { room_id: room.room_id, plans: !discoveryError && discovery?.ok ? discovery.plans : [] };
    }));
    const planOptionsByRoom = new Map(ratePlanChoices.map((item: any) => [item.room_id, item.plans]));
    const pricingFailure = (rows ?? []).find((room: any) => room.pricing_quote?.ok === false && room.pricing_quote?.error_code !== "RATE_PLAN_REQUIRED");
    if (pricingFailure) {
      throw new Error(`Pricing rejected [${pricingFailure.pricing_quote.error_code ?? "INVALID_RATE_CONFIGURATION"}]: ${pricingFailure.pricing_quote.message ?? "Pricing configuration is invalid"}`);
    }

    return (rows ?? [])
      .map((room: any) => ({
        rate_plan_options: planOptionsByRoom.get(room.room_id) ?? [],
        ...room,
        base_price: Number(room.base_price),
        nightly_total: Number(room.pricing_quote?.total ?? room.nightly_total),
        pricing_quote: room.pricing_quote,
        fits_guests: Boolean(room.fits_occupancy),
      }))
      .filter((room: any) => room.is_available && room.fits_guests)
      .sort((a: any, b: any) => a.nightly_total - b.nightly_total);
  });

const createBookingSchema = z.object({
  propertySlug: propertySlugSchema,
  roomSlug: z.string().min(1).max(80),
  checkIn: dateSchema,
  checkOut: dateSchema,
  adults: z.number().int().min(1).max(8),
  children: z.number().int().min(0).max(6).default(0),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().trim().email().max(255),
  guestPhone: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  specialRequests: z.string().trim().max(1000).optional().or(z.literal("")),
  ratePlanId: z.string().uuid().optional(),
});

export const createPublicDemoBooking = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => createBookingSchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug);

    // Use the existing property-scoped transactional booking RPC. The service
    // role is confined to this server function; the property ID is resolved
    // server-side from the explicit UAT demo allowlist and never trusted from
    // the browser.
    const { data: rows, error } = await (supabaseAdmin as any).rpc("create_booking_for_property_with_rate_plan", {
      _property_id: property.id,
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children: data.children,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _extras: [],
      _children_below_6: 0,
      _children_7_plus: data.children,
      _hold_id: null,
      _session_id: null,
      _payment_method: "pay_at_property",
      _rate_plan_id: data.ratePlanId ?? null,
    });

    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("The reservation could not be created.");

    return {
      bookingId: row.booking_id,
      reference: row.reference,
      total: Number(row.total),
      currency: row.currency,
      propertyName: property.name,
      paymentStatus: "unpaid" as const,
      paymentEnabled: false,
    };
  });
