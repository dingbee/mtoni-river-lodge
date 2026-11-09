/* eslint-disable @typescript-eslint/no-explicit-any -- existing server RPC surfaces use runtime contracts not yet represented in generated database types */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Preserve the original Nolmark UAT demonstration while allowing other properties
// only through an explicitly published permanent booking page or published campaign.
const PUBLIC_DEMO_PROPERTY_SLUGS = new Set(["nolmark-cdma-staynas"]);

async function resolvePublicDemoProperty(propertySlug: string, campaignSlug?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb: any = supabaseAdmin;
  const { data, error } = await sb.from("staynas_properties")
    .select("id, slug, name, currency, timezone, status")
    .eq("slug", propertySlug).maybeSingle();
  if (error) throw new Error("Unable to load this property.");
  if (!data || data.status !== "active") throw new Error("This property is not available for online reservations.");
  if (!/^[A-Z]{3}$/.test(data.currency ?? "")) throw new Error("This property has no valid configured currency.");

  if (!PUBLIC_DEMO_PROPERTY_SLUGS.has(propertySlug)) {
    if (campaignSlug) {
      const { data: campaign, error: campaignError } = await sb.from("booking_campaigns")
        .select("id,status,starts_at,ends_at").eq("property_id", data.id)
        .eq("slug", campaignSlug).eq("status", "published").maybeSingle();
      const now = Date.now();
      if (campaignError || !campaign || (campaign.starts_at && Date.parse(campaign.starts_at) > now)
        || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)) {
        throw new Error("The campaign booking context is not currently valid.");
      }
    } else {
      const { data: page, error: pageError } = await sb.from("booking_pages")
        .select("id").eq("property_id", data.id).eq("status", "published").maybeSingle();
      if (pageError || !page) throw new Error("This property's permanent direct booking page is not published.");
    }
  }
  return { property: data, supabaseAdmin, demo: PUBLIC_DEMO_PROPERTY_SLUGS.has(propertySlug) };
}

const propertySlugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const campaignSlugSchema = z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const campaignContextSchema = z.object({
  campaignSlug: campaignSlugSchema.optional(),
  offerId: z.string().uuid().optional(),
  sessionKey: z.string().min(16).max(160).optional(),
});
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getPublicDemoProperty = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ propertySlug: propertySlugSchema, campaignSlug: campaignSlugSchema.optional() }).parse(value))
  .handler(async ({ data }) => {
    const { property, supabaseAdmin, demo } = await resolvePublicDemoProperty(data.propertySlug, data.campaignSlug);
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
      demo,
      paymentEnabled: false,
    };
  });

const availabilitySchema = z.object({
  propertySlug: propertySlugSchema,
  checkIn: dateSchema,
  checkOut: dateSchema,
  guests: z.number().int().min(1).max(8),
  ratePlanId: z.string().uuid().optional(),
}).merge(campaignContextSchema);

export const searchPublicDemoAvailability = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => availabilitySchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug, data.campaignSlug);
    const sb: any = supabaseAdmin;
    let allowedRoomIds: Set<string> | null = null;
    if (data.campaignSlug) {
      const { data: campaign } = await sb.from("booking_campaigns").select("id")
        .eq("property_id", property.id).eq("slug", data.campaignSlug).eq("status", "published").maybeSingle();
      if (!campaign || !data.offerId || !data.ratePlanId) throw new Error("Campaign offer context is required.");
      const { data: offer } = await sb.from("campaign_offers").select("id,rate_plan_publication_id")
        .eq("id", data.offerId).eq("campaign_id", campaign.id).eq("property_id", property.id).eq("active", true).maybeSingle();
      if (!offer) throw new Error("The selected campaign offer is no longer available.");
      const { data: publication } = await sb.from("staynas_rate_plan_publications").select("rate_plan_id,currency")
        .eq("id", offer.rate_plan_publication_id).eq("property_id", property.id).maybeSingle();
      if (!publication || publication.rate_plan_id !== data.ratePlanId || publication.currency !== property.currency) {
        throw new Error("The selected offer does not match the property's current published pricing evidence.");
      }
      const { data: selections } = await sb.from("campaign_room_selections").select("room_id")
        .eq("campaign_id", campaign.id).eq("property_id", property.id);
      allowedRoomIds = new Set((selections ?? []).map((item: any) => item.room_id));
      if (!allowedRoomIds.size) throw new Error("The campaign has no currently selected room types.");
    }
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

    // A published plan is not required to cover every room type. A room with
    // NO_ELIGIBLE_RATE_PLAN is simply not sellable for this stay under the
    // currently published SPE-03 configuration; it must not poison the
    // availability response for other room types that do have eligible plans.
    // All other resolver failures remain fail-closed and visible.
    const pricingFailure = (rows ?? []).find((room: any) =>
      room.pricing_quote?.ok === false
      && !["RATE_PLAN_REQUIRED", "NO_ELIGIBLE_RATE_PLAN"].includes(room.pricing_quote?.error_code)
    );
    if (pricingFailure) {
      throw new Error(`Pricing rejected [${pricingFailure.pricing_quote.error_code ?? "INVALID_RATE_CONFIGURATION"}]: ${pricingFailure.pricing_quote.message ?? "Pricing configuration is invalid"}`);
    }

    return (rows ?? [])
      .filter((room: any) => !allowedRoomIds || allowedRoomIds.has(room.room_id))
      .filter((room: any) => {
        const errorCode = room.pricing_quote?.error_code;
        if (errorCode === "NO_ELIGIBLE_RATE_PLAN") return false;
        if (errorCode === "RATE_PLAN_REQUIRED") {
          return (planOptionsByRoom.get(room.room_id) ?? []).length > 0;
        }
        return true;
      })
      .map((room: any) => ({
        rate_plan_options: planOptionsByRoom.get(room.room_id) ?? [],
        ...room,
        base_price: Number(room.base_price),
        nightly_total: room.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(room.pricing_quote?.total ?? room.nightly_total),
        pricing_quote: room.pricing_quote,
        fits_guests: Boolean(room.fits_occupancy),
      }))
      .filter((room: any) => room.is_available && room.fits_guests)
      .sort((a: any, b: any) => (a.nightly_total ?? Number.POSITIVE_INFINITY) - (b.nightly_total ?? Number.POSITIVE_INFINITY));
  });

const publicQuoteSchema = z.object({
  propertySlug: propertySlugSchema,
  roomSlug: z.string().min(1).max(80),
  checkIn: dateSchema,
  checkOut: dateSchema,
  adults: z.number().int().min(1).max(8),
  ratePlanId: z.string().uuid(),
  guestEmail: z.string().trim().email().max(255),
}).merge(campaignContextSchema);

export const getPublicDemoQuote = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => publicQuoteSchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug, data.campaignSlug);
    if (data.campaignSlug) {
      const sb: any = supabaseAdmin;
      const { data: campaign } = await sb.from("booking_campaigns").select("id")
        .eq("property_id", property.id).eq("slug", data.campaignSlug).eq("status", "published").maybeSingle();
      const { data: offer } = await sb.from("campaign_offers").select("id,rate_plan_publication_id")
        .eq("id", data.offerId).eq("campaign_id", campaign?.id).eq("property_id", property.id).eq("active", true).maybeSingle();
      const { data: publication } = offer ? await sb.from("staynas_rate_plan_publications").select("rate_plan_id,currency")
        .eq("id", offer.rate_plan_publication_id).eq("property_id", property.id).maybeSingle() : { data: null };
      if (!campaign || !offer || !publication || publication.rate_plan_id !== data.ratePlanId || publication.currency !== property.currency) {
        throw new Error("The selected campaign offer failed pricing evidence validation.");
      }
      if (data.sessionKey) {
        const { error: attributionError } = await sb.from("campaign_attribution").upsert({
          campaign_id: campaign.id, property_id: property.id, session_key: data.sessionKey,
          event_type: "booking_started", event_key: `${data.sessionKey}:booking_started`,
          metadata: { offerId: data.offerId }, occurred_at: new Date().toISOString(),
        }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
        if (attributionError) throw new Error("Campaign booking attribution could not be recorded.");
      }
    }
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
}).merge(campaignContextSchema);

export const createPublicDemoBooking = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => createBookingSchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug, data.campaignSlug);
    let campaignId: string | null = null;
    if (data.campaignSlug) {
      const sb: any = supabaseAdmin;
      const { data: campaign } = await sb.from("booking_campaigns").select("id")
        .eq("property_id", property.id).eq("slug", data.campaignSlug).eq("status", "published").maybeSingle();
      const { data: offer } = await sb.from("campaign_offers").select("id,rate_plan_publication_id")
        .eq("id", data.offerId).eq("campaign_id", campaign?.id).eq("property_id", property.id).eq("active", true).maybeSingle();
      const { data: publication } = offer ? await sb.from("staynas_rate_plan_publications").select("rate_plan_id,currency")
        .eq("id", offer.rate_plan_publication_id).eq("property_id", property.id).maybeSingle() : { data: null };
      if (!campaign || !offer || !publication || publication.rate_plan_id !== data.ratePlanId || publication.currency !== property.currency) {
        throw new Error("The campaign offer does not match the submitted booking pricing context.");
      }
      campaignId = campaign.id;
    }

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
    if (campaignId && data.sessionKey) {
      const { error: attributionError } = await (supabaseAdmin as any).from("campaign_attribution").upsert({
        campaign_id: campaignId, property_id: property.id, booking_id: result.booking_id,
        session_key: data.sessionKey, event_type: "booking_completed",
        event_key: `${data.sessionKey}:booking_completed`,
        metadata: data.offerId ? { offerId: data.offerId } : {},
        occurred_at: new Date().toISOString(),
      }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
      if (attributionError) console.error("[StayNas campaign attribution] Booking created but attribution failed", { code: attributionError.code, propertyId: property.id });
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
