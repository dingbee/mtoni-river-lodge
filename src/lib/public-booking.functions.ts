/* eslint-disable @typescript-eslint/no-explicit-any -- existing server RPC surfaces use runtime contracts not yet represented in generated database types */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isIsoCurrencyCode } from "@/lib/money";
import { mapPublicAvailability, toPublicCatalogRoom } from "@/lib/public-availability";
import { parseTemplateContent, publicGalleryUrls } from "@/lib/direct-booking-content";

// Public booking resolves every published property by its public slug.
// Tenant/property isolation is enforced by resolving one property first and
// scoping every catalogue, availability, quote and booking operation to its ID.
async function resolvePublicProperty(propertySlug: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_properties")
    .select("id, slug, name, currency, timezone, status")
    .eq("slug", propertySlug)
    .maybeSingle();

  if (error) throw new Error("Unable to load this property.");
  if (!data || data.status !== "active") throw new Error("This property is not available for online reservations.");
  if (!isIsoCurrencyCode(data.currency)) {
    throw new Error("A valid property currency must be configured before online reservations can be enabled.");
  }

  return { property: data, supabaseAdmin };
}

const propertySlugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getPublicDemoProperty = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ propertySlug: propertySlugSchema }).parse(value))
  .handler(async ({ data }) => {
    const { property, supabaseAdmin } = await resolvePublicProperty(data.propertySlug);
    const { data: rooms, error } = await (supabaseAdmin as any)
      .from("rooms")
      .select("id,slug,name,short_name,short_description,description,details,cta_line,hero_line,bed_label,bathroom_label,amenities,max_occupancy,capacity_adults,capacity_children,total_units,base_price,currency,included_guests,extra_guest_fee,image_url,gallery_urls,size_label,view_label,category:room_categories(id,slug,name,description,features,specifications)")
      .eq("property_id", property.id)
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    const { data: brandingRow, error: brandingError } = await (supabaseAdmin as any)
      .from("staynas_property_branding")
      // "*" keeps the page working before the template-content review migration is
      // applied; only the explicitly mapped fields below are returned to guests.
      .select("*")
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
        galleryImageUrls: publicGalleryUrls(branding.gallery_image_urls),
        showStayNasAttribution: branding.show_staynas_attribution ?? true,
        ...parseTemplateContent(branding),
      },
      rooms: (rooms ?? []).map((room: any) => toPublicCatalogRoom(room, property)),
      demo: false,
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
    const { property, supabaseAdmin } = await resolvePublicProperty(data.propertySlug);
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

    return mapPublicAvailability(rows ?? [], planOptionsByRoom, property);
  });

const publicQuoteSchema = z.object({
  propertySlug: propertySlugSchema,
  roomSlug: z.string().min(1).max(80),
  checkIn: dateSchema,
  checkOut: dateSchema,
  adults: z.number().int().min(1).max(8),
  ratePlanId: z.string().uuid(),
  guestEmail: z.string().trim().email().max(255),
});

export const getPublicDemoQuote = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => publicQuoteSchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicProperty(data.propertySlug);
    const { data: quote, error } = await (supabaseAdmin as any).rpc("staynas_create_reservation_quote", {
      _property_id: property.id,
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children_below_6: 0,
      _children_7_plus: 0,
      _extras: [],
      _rate_plan_id: data.ratePlanId,
      _promo_code: null,
      _guest_email: data.guestEmail,
      _ttl_seconds: 600,
    });
    if (error) throw new Error(error.message);
    if (!quote?.quote_id) throw new Error(`Pricing quote rejected [${quote?.error_code ?? "QUOTE_FAILED"}]: ${quote?.message ?? "The final price could not be calculated"}`);
    if (String(quote.currency ?? "").toUpperCase() !== property.currency) {
      throw new Error(`Pricing quote rejected [CURRENCY_MISMATCH]: quote is in ${quote.currency ?? "no currency"} but ${property.name} sells in ${property.currency}`);
    }
    return quote;
  });

const createBookingSchema = z.object({
  propertySlug: propertySlugSchema,
  quoteId: z.string().uuid(),
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
    const { property, supabaseAdmin } = await resolvePublicProperty(data.propertySlug);

    // The guest submits the exact server-issued quote. The database rechecks
    // its expiry, pricing evidence, inventory and idempotency in one transaction.
    const { data: result, error } = await (supabaseAdmin as any).rpc("staynas_create_reservation_from_quote", {
      _quote_id: data.quoteId,
      _property_id: property.id,
      _idempotency_key: data.quoteId,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _payment_method: "pay_at_property",
      _source: "website",
      _hold_id: null,
      _session_id: null,
      _target_status: "pending",
      _actor_id: null,
      _visit_purpose: null,
      _notes: null,
    });
    if (error) throw new Error(error.message);
    if (result?.ok === false) {
      throw new Error(`Reservation rejected [${result.error_code ?? "RESERVATION_REJECTED"}]: ${result.message ?? "The reservation could not be created"}`);
    }
    if (!result?.booking_id) throw new Error("The reservation could not be created.");
    if (String(result.currency ?? "").toUpperCase() !== property.currency) {
      // The database rejects this before commit; this guards the response contract.
      throw new Error(`Reservation ${result.reference} was recorded in ${result.currency} instead of ${property.currency}; contact the property before paying.`);
    }

    return {
      bookingId: result.booking_id,
      reference: result.reference,
      total: Number(result.total),
      currency: result.currency,
      propertyName: property.name,
      paymentStatus: "unpaid" as const,
      paymentEnabled: false,
    };
  });
