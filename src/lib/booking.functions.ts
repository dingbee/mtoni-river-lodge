/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase RPC surface uses runtime contracts not yet represented in generated database types */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";
import { assertSameProperty } from "@/lib/booking-property";

function getPublicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

function dateInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const campaignBookingContextSchema = z.object({
  propertySlug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  campaignSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  offerId: z.string().uuid().optional(),
  sessionKey: z.string().trim().min(16).max(140).optional(),
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
  utmContent: z.string().trim().max(200).optional(),
  utmTerm: z.string().trim().max(200).optional(),
  referrer: z.string().url().max(2000).optional(),
});

async function resolveCampaignBookingContext(
  sb: any,
  propertyId: string,
  input: {
    propertySlug?: string; campaignSlug?: string; offerId?: string; sessionKey?: string;
    ratePlanId?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string;
    utmContent?: string; utmTerm?: string; referrer?: string;
  },
) {
  if (!input.campaignSlug && !input.offerId && !input.propertySlug && !input.sessionKey) return null;
  if (!input.propertySlug || !input.campaignSlug || !input.offerId || !input.sessionKey || !input.ratePlanId) {
    throw new Error("Campaign booking requires a complete campaign offer and published rate-plan context.");
  }
  const [{ data: property, error: propertyError }, { data: campaign, error: campaignError }] = await Promise.all([
    sb.from("staynas_properties").select("id,slug,currency,status,timezone").eq("id", propertyId).maybeSingle(),
    sb.from("booking_campaigns").select("id,property_id,status,starts_at,ends_at")
      .eq("property_id", propertyId).eq("slug", input.campaignSlug).eq("status", "published").maybeSingle(),
  ]);
  const now = Date.now();
  if (propertyError || !property || property.status !== "active" || property.slug !== input.propertySlug
    || !/^[A-Z]{3}$/.test(property.currency ?? "") || !property.timezone) {
    throw new Error("Campaign property does not match the active booking property or has no configured currency.");
  }
  if (campaignError || !campaign || (campaign.starts_at && Date.parse(campaign.starts_at) > now)
    || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)) {
    throw new Error("Campaign is not currently eligible for booking.");
  }
  const { data: offer, error: offerError } = await sb.from("campaign_offers")
    .select("id,rate_plan_publication_id").eq("id", input.offerId)
    .eq("campaign_id", campaign.id).eq("property_id", propertyId).eq("active", true).maybeSingle();
  if (offerError || !offer) throw new Error("Selected campaign offer is no longer available.");
  const { data: publication, error: publicationError } = await sb.from("staynas_rate_plan_publications")
    .select("id,rate_plan_id,publication_number,rate_plan_version,snapshot_hash,currency,effective_from,effective_to")
    .eq("id", offer.rate_plan_publication_id).eq("property_id", propertyId).maybeSingle();
  if (publicationError || !publication || publication.rate_plan_id !== input.ratePlanId
    || publication.currency !== property.currency
    || (publication.effective_from && publication.effective_from > dateInTimezone(property.timezone))
    || (publication.effective_to && publication.effective_to < dateInTimezone(property.timezone))) {
    throw new Error("Campaign offer does not match a currently effective published pricing snapshot in the property currency.");
  }
  const { data: plan, error: planError } = await sb.from("staynas_rate_plans")
    .select("id,active,publication_status,currency").eq("id", publication.rate_plan_id)
    .eq("property_id", propertyId).maybeSingle();
  if (planError || !plan || !plan.active || plan.publication_status !== "published" || plan.currency !== property.currency) {
    throw new Error("Campaign rate plan is no longer active and published for this property.");
  }
  const { data: latestPublication, error: latestPublicationError } = await sb.from("staynas_rate_plan_publications")
    .select("id").eq("property_id", propertyId).eq("rate_plan_id", publication.rate_plan_id)
    .order("publication_number", { ascending: false }).limit(1).maybeSingle();
  if (latestPublicationError || latestPublication?.id !== publication.id) {
    throw new Error("Campaign offer snapshot has been superseded. Reconfigure the offer against the latest published rate plan.");
  }
  const { data: selections, error: selectionsError } = await sb.from("campaign_room_selections")
    .select("room_id").eq("campaign_id", campaign.id).eq("property_id", propertyId);
  if (selectionsError || !selections?.length) throw new Error("Campaign has no active room selection.");
  return {
    campaignId: campaign.id,
    offerId: offer.id,
    allowedRoomIds: new Set<string>(selections.map((item: any) => item.room_id)),
    sessionKey: input.sessionKey,
    pricingEvidence: {
      publicationId: publication.id,
      ratePlanId: publication.rate_plan_id,
      publicationNumber: publication.publication_number,
      ratePlanVersion: publication.rate_plan_version,
      snapshotHash: publication.snapshot_hash,
      currency: publication.currency,
    },
    attribution: {
      source: input.utmSource ?? null, medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null, utm_content: input.utmContent ?? null,
      utm_term: input.utmTerm ?? null, referrer: input.referrer ?? null,
    },
  };
}

async function assertCampaignRoomSelection(sb: any, propertyId: string, roomSlug: string, context: Awaited<ReturnType<typeof resolveCampaignBookingContext>>) {
  if (!context) return;
  const { data: room, error } = await sb.from("rooms").select("id")
    .eq("property_id", propertyId).eq("slug", roomSlug).eq("status", "active").maybeSingle();
  if (error || !room || !context.allowedRoomIds.has(room.id)) {
    throw new Error("Selected room is not included in this campaign.");
  }
}



const availabilitySchema = z.object({
  checkIn: dateStr,
  checkOut: dateStr,
  guests: z.number().int().min(1).max(20).optional(),
  adults: z.number().int().min(1).max(10).default(1),
  childrenBelow6: z.number().int().min(0).max(10).default(0),
  children7Plus: z.number().int().min(0).max(10).default(0),
  ratePlanId: z.string().uuid().optional(),
}).merge(campaignBookingContextSchema);

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
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const sb: any = supabaseAdmin;
    const campaignContext = await resolveCampaignBookingContext(sb, propertyId, data);
    const { data: rows, error } = await sb.rpc("get_staynas_room_availability_priced_with_rate_plan", {
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _property_id: propertyId,
      _adults: data.adults,
      _children_below_6: data.childrenBelow6,
      _children_7_plus: data.children7Plus,
      _rate_plan_id: data.ratePlanId ?? null,
    });
    if (error) throw new Error(error.message);
    const mapped = await Promise.all(((rows ?? []) as any[]).filter((r) =>
      !campaignContext || campaignContext.allowedRoomIds.has(r.room_id)
    ).map(async (r) => {
      let ratePlanOptions: PublicRatePlanOption[] = [];
      if (r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" || r.pricing_quote?.pricing_evidence?.rate_plan_id) {
        const { data: discovery, error: discoveryError } = await (supabaseAdmin as any).rpc("discover_staynas_public_rate_plans", {
          _property_id: propertyId, _room_id: r.room_id, _check_in: data.checkIn, _check_out: data.checkOut,
          _adults: data.adults, _children_below_6: data.childrenBelow6, _children_7_plus: data.children7Plus,
        });
        if (!discoveryError && discovery?.ok) ratePlanOptions = (discovery.plans ?? []) as PublicRatePlanOption[];
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
}).merge(campaignBookingContextSchema);

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
  }).merge(campaignBookingContextSchema).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const sb: any = supabaseAdmin;
    const campaignContext = await resolveCampaignBookingContext(sb, propertyId, data);
    await assertCampaignRoomSelection(sb, propertyId, data.roomSlug, campaignContext);
    const { data: quote, error } = await sb.rpc("staynas_create_reservation_quote", {
      _property_id: propertyId,
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
    if (campaignContext) {
      const { error: attributionError } = await sb.from("campaign_attribution").upsert({
        campaign_id: campaignContext.campaignId, property_id: propertyId,
        session_key: campaignContext.sessionKey, event_type: "booking_started",
        event_key: `${campaignContext.campaignId}:${campaignContext.sessionKey}:booking_started`,
        source: campaignContext.attribution.source, medium: campaignContext.attribution.medium,
        utm_campaign: campaignContext.attribution.utm_campaign, utm_content: campaignContext.attribution.utm_content,
        utm_term: campaignContext.attribution.utm_term, referrer: campaignContext.attribution.referrer,
        metadata: { offerId: campaignContext.offerId, pricingEvidence: campaignContext.pricingEvidence, quoteId: quote.quote_id }, occurred_at: new Date().toISOString(),
      }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
      if (attributionError) console.error("[StayNas campaign attribution] Quote created but booking-start event failed", { code: attributionError.code, propertyId });
    }
    return quote as BookingPricingQuote;
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookingSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb: any = supabaseAdmin;
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const campaignContext = await resolveCampaignBookingContext(sb, propertyId, {
      ...data, sessionKey: data.sessionKey ?? (data.sessionId && data.sessionId.length >= 16 ? data.sessionId : data.quoteId),
    });
    await assertCampaignRoomSelection(sb, propertyId, data.roomSlug, campaignContext);
    if (campaignContext) {
      const { data: quoteRecord, error: quoteRecordError } = await sb.from("staynas_reservation_quotes")
        .select("property_id,request,expires_at,consumed_at,booking_id")
        .eq("id", data.quoteId).eq("property_id", propertyId).maybeSingle();
      const request = quoteRecord?.request ?? {};
      const previouslyBooked = !!quoteRecord?.consumed_at && !!quoteRecord?.booking_id;
      if (quoteRecordError || !quoteRecord
        || (quoteRecord.consumed_at && !previouslyBooked)
        || (!previouslyBooked && Date.parse(quoteRecord.expires_at) <= Date.now())
        || request.room_slug !== data.roomSlug
        || request.rate_plan_id !== data.ratePlanId
        || request.check_in !== data.checkIn || request.check_out !== data.checkOut) {
        throw new Error("Reservation quote does not match the validated campaign offer, room, dates and property.");
      }
    }
    const { data: result, error } = await sb.rpc("staynas_create_reservation_from_quote", {
      _quote_id: data.quoteId,
      _property_id: propertyId,
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
    if (campaignContext) {
      const { error: attributionError } = await sb.from("campaign_attribution").upsert({
        campaign_id: campaignContext.campaignId, property_id: propertyId, booking_id: row.booking_id,
        session_key: campaignContext.sessionKey, event_type: "booking_completed",
        event_key: `${campaignContext.campaignId}:${row.booking_id}:booking_completed`,
        source: campaignContext.attribution.source, medium: campaignContext.attribution.medium,
        utm_campaign: campaignContext.attribution.utm_campaign, utm_content: campaignContext.attribution.utm_content,
        utm_term: campaignContext.attribution.utm_term, referrer: campaignContext.attribution.referrer,
        metadata: { offerId: campaignContext.offerId, pricingEvidence: campaignContext.pricingEvidence, quoteId: data.quoteId }, occurred_at: new Date().toISOString(),
      }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
      if (attributionError) console.error("[StayNas campaign attribution] Reservation created but attribution persistence failed", { code: attributionError.code, propertyId });
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
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const { data: row, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select(
        "id, reference, check_in, check_out, nights, adults, children, guest_name, guest_email, total, currency, status, payment_status, room_id, property_id",
      )
      .eq("reference", data.reference)
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
      .maybeSingle();
    return { ...row, total: Number(row.total), room };
  });