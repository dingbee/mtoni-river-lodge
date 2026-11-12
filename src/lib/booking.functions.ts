/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase RPC surface uses runtime contracts not yet represented in generated database types */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameProperty } from "@/lib/booking-property";
import { resolvePublicDirectBookingChannel } from "@/lib/public-booking-channel.server";
import { getPublicBookingProducts } from "@/domains/booking/booking-product-configuration.functions";
import { publicCampaignBookingSchema, resolvePublicCampaignBookingContext } from "@/lib/public-campaign-booking.server";


const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const availabilitySchema = z.object({
  checkIn: dateStr,
  checkOut: dateStr,
  guests: z.number().int().min(1).max(20).optional(),
  adults: z.number().int().min(1).max(10).default(1),
  childrenBelow6: z.number().int().min(0).max(10).default(0),
  children7Plus: z.number().int().min(0).max(10).default(0),
  ratePlanId: z.string().uuid().optional(),
}).merge(publicCampaignBookingSchema);

export type PublicRatePlanOption = { rate_plan_id: string; name: string; description: string | null; meal_plan: string | null; refundable: boolean; currency: string; total: number; average_nightly_rate: number; minimum_stay: number; nightly_breakdown: Array<{ date: string; nightly_rate: number; currency: string; source_label: string; pricing_basis: string; source_rate: number }>; publication_id: string; publication_number: number; rate_plan_version: number; snapshot_hash: string };

export type AvailabilityRoom = {
  rate_plan_options?: PublicRatePlanOption[];
  selected_rate_plan_id?: string;
  selected_rate_plan?: PublicRatePlanOption;
  room_id: string;
  slug: string;
  name: string;
  base_price: number | null;
  currency: string;
  capacity_adults: number;
  capacity_children: number;
  max_occupancy: number;
  included_guests: number;
  extra_guest_fee: number;
  nights: number;
  nightly_total: number | null;
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
    const campaignContext = await resolvePublicCampaignBookingContext(supabaseAdmin as any, propertyId, data);
    const allowedPlansByRoom = new Map<string, Set<string>>();
    if (campaignContext) {
      for (const roomId of campaignContext.allowedRoomIds) allowedPlansByRoom.set(roomId, new Set([campaignContext.ratePlanId]));
    } else {
      const configured = await getPublicBookingProducts({ data: { channel: "permanent" } });
      for (const product of configured.products as Array<{ room_id: string; rate_plan_id: string }>) {
        const allowed = allowedPlansByRoom.get(product.room_id) ?? new Set<string>();
        allowed.add(product.rate_plan_id);
        allowedPlansByRoom.set(product.room_id, allowed);
      }
    }
    if (allowedPlansByRoom.size === 0) return [];
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
    const mapped = await Promise.all(((rows ?? []) as any[]).filter((r) => !campaignContext || campaignContext.allowedRoomIds.has(String(r.room_id))).map(async (r) => {
      const allowedPlanIds = allowedPlansByRoom.get(String(r.room_id));
      if (!allowedPlanIds?.size || (data.ratePlanId && !allowedPlanIds.has(data.ratePlanId))) {
        return null;
      }
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
          ratePlanOptions = ((discovery.plans ?? []) as PublicRatePlanOption[]).filter(
            (plan) => allowedPlanIds.has(plan.rate_plan_id),
          );
          if (ratePlanOptions.some((plan) => plan.currency !== channel.currency)) {
            throw new Error("Published rate-plan currency does not match the direct-booking channel");
          }
        }
      }
      return {
      ...r,
      selected_rate_plan_id: campaignContext?.ratePlanId ?? r.pricing_quote?.pricing_evidence?.rate_plan_id ?? null,
      rate_plan_options: ratePlanOptions,
      nightly_total: r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(r.nightly_total),
      base_price: r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(r.base_price),
      extra_guest_fee: Number(r.extra_guest_fee),
      pricing_quote: r.pricing_quote as BookingPricingQuote | null,
    };
    }));
    return mapped.filter((room): room is NonNullable<typeof room> => room !== null);
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
  sessionId: z.string().min(24).max(120).optional(),
}).merge(publicCampaignBookingSchema);

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
  }).merge(publicCampaignBookingSchema).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const campaignContext = await resolvePublicCampaignBookingContext(supabaseAdmin as any, channel.propertyId, data);
    if (campaignContext && !campaignContext.allowedRoomIds.size) throw new Error("Campaign has no eligible rooms.");
    const { data: room, error: roomError } = await (supabaseAdmin as any)
      .from("rooms")
      .select("id")
      .eq("property_id", channel.propertyId)
      .eq("slug", data.roomSlug)
      .eq("status", "active")
      .maybeSingle();
    if (roomError || !room) throw new Error("Selected room is not available for this booking property.");
    if (campaignContext && !campaignContext.allowedRoomIds.has(room.id)) throw new Error("Selected room is not included in this campaign.");

    let eligiblePlanIds = new Set<string>();
    if (campaignContext) {
      eligiblePlanIds.add(campaignContext.ratePlanId);
    } else {
      const configured = await getPublicBookingProducts({ data: { channel: "permanent" } });
      const roomProducts = (configured.products as Array<{ room_id: string; rate_plan_id: string }>)
        .filter((product) => product.room_id === room.id);
      eligiblePlanIds = new Set(roomProducts.map((product) => product.rate_plan_id));
      if (eligiblePlanIds.size === 0) throw new Error("This room is not published for permanent direct booking.");
    }
    const selectedRatePlanId = data.ratePlanId ?? (eligiblePlanIds.size === 1 ? [...eligiblePlanIds][0] : null);
    if (!selectedRatePlanId || !eligiblePlanIds.has(selectedRatePlanId)) {
      throw new Error(campaignContext ? "Selected rate plan is not included in this campaign offer." : "Select a rate plan published for this room on the permanent booking channel.");
    }

    const { data: quote, error } = await (supabaseAdmin as any).rpc("staynas_create_public_channel_quote", {
      _sales_channel_id: channel.channelId,
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children_below_6: data.childrenBelow6,
      _children_7_plus: data.children7Plus,
      _extras: data.extras,
      _rate_plan_id: selectedRatePlanId,
      _promo_code: data.promoCode?.trim() || null,
      _guest_email: data.guestEmail?.trim() || null,
      _ttl_seconds: 600,
    });
    if (error) throw new Error(error.message);
    if (!quote) throw new Error("Pricing quote could not be calculated");
    if (quote.ok === false) {
      throw new Error(`Pricing rejected [${quote.error_code ?? "INVALID_RATE_CONFIGURATION"}]: ${quote.message ?? "Pricing configuration is invalid"}`);
    }
    const sessionKey = data.sessionKey ?? campaignContext?.sessionKey ?? null;
    if (sessionKey) {
      const touch = {
        source: data.utmSource ?? null,
        medium: data.utmMedium ?? null,
        utm_campaign: data.utmCampaign ?? null,
        utm_content: data.utmContent ?? null,
        utm_term: data.utmTerm ?? null,
        referrer: data.referrer ?? null,
      };
      try {
        const { data: attributionResult, error: attributionError } = await (supabaseAdmin as any).rpc(
          "staynas_upsert_booking_attribution",
          {
            _property_id: channel.propertyId,
            _organisation_id: channel.organisationId,
            _session_key: sessionKey,
            _booking_page_id: null,
            _campaign_id: campaignContext?.campaignId ?? null,
            _campaign_offer_id: campaignContext?.offerId ?? null,
            _touch: touch,
            _touch_at: new Date().toISOString(),
            _is_external_acquisition: Boolean(data.utmSource || data.utmMedium || data.utmCampaign || data.referrer),
          },
        );
        const attributionId = attributionResult?.attribution_id;
        if (attributionError || !attributionId) {
          console.error("[StayNas analytics] Attribution could not be linked to quote", { code: attributionError?.code, propertyId: channel.propertyId });
        } else {
          const { data: attached, error: attachError } = await (supabaseAdmin as any).rpc(
            "staynas_attach_quote_attribution",
            { _quote_id: quote.quote_id, _property_id: channel.propertyId, _attribution_id: attributionId },
          );
          if (attachError || attached !== true) {
            console.error("[StayNas analytics] Quote attribution attachment failed", { code: attachError?.code, propertyId: channel.propertyId });
          } else {
            const { error: eventError } = await (supabaseAdmin as any).rpc("staynas_record_booking_analytics_event", {
              _property_id: channel.propertyId,
              _organisation_id: channel.organisationId,
              _event_type: "quote_generated",
              _event_key: `quote-generated:${quote.quote_id}`,
              _event_source: "server_confirmed",
              _attribution_id: attributionId,
              _campaign_id: campaignContext?.campaignId ?? null,
              _quote_id: quote.quote_id,
              _session_key: sessionKey,
              _traffic_source: data.utmSource ?? null,
              _traffic_medium: data.utmMedium ?? null,
              _utm_campaign: data.utmCampaign ?? null,
              _utm_content: data.utmContent ?? null,
              _utm_term: data.utmTerm ?? null,
              _referrer: data.referrer ?? null,
              _landing_page: campaignContext ? `/p/${data.propertySlug}/campaign/${data.campaignSlug}` : `/p/${data.propertySlug}/book`,
              _metadata: { offer_id: campaignContext?.offerId ?? null },
            });
            if (eventError) console.error("[StayNas analytics] Quote event was not recorded", { code: eventError.code, propertyId: channel.propertyId });
          }
        }
      } catch (analyticsError) {
        console.error("[StayNas analytics] Quote attribution processing failed", {
          propertyId: channel.propertyId,
          message: analyticsError instanceof Error ? analyticsError.message : "unknown",
        });
      }
    }
    if (campaignContext) {
      const { error: attributionError } = await (supabaseAdmin as any).from("campaign_attribution").upsert({
        campaign_id: campaignContext.campaignId, property_id: channel.propertyId,
        session_key: campaignContext.sessionKey, event_type: "booking_started",
        event_key: `${campaignContext.campaignId}:${campaignContext.sessionKey}:booking_started`,
        source: campaignContext.attribution.source, medium: campaignContext.attribution.medium,
        utm_campaign: campaignContext.attribution.utm_campaign, utm_content: campaignContext.attribution.utm_content,
        utm_term: campaignContext.attribution.utm_term, referrer: campaignContext.attribution.referrer,
        metadata: { offerId: campaignContext.offerId, pricingEvidence: campaignContext.pricingEvidence, quoteId: quote.quote_id },
        occurred_at: new Date().toISOString(),
      }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
      if (attributionError) console.error("[StayNas campaign attribution] Quote created but booking-start event failed", { code: attributionError.code, propertyId: channel.propertyId });
    }
    return quote as BookingPricingQuote;
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createBookingSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb: any = supabaseAdmin;
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const campaignContext = await resolvePublicCampaignBookingContext(sb, channel.propertyId, {
      ...data,
      sessionKey: data.sessionKey ?? (data.sessionId && data.sessionId.length >= 16 ? data.sessionId : data.quoteId),
    });
    if (campaignContext) {
      const { data: room, error: roomError } = await sb.from("rooms").select("id")
        .eq("property_id", channel.propertyId).eq("slug", data.roomSlug).eq("status", "active").maybeSingle();
      if (roomError || !room || !campaignContext.allowedRoomIds.has(room.id)) throw new Error("Selected room is not included in this campaign.");
      const { data: quoteRecord, error: quoteError } = await sb.from("staynas_reservation_quotes")
        .select("property_id,request,expires_at,consumed_at,booking_id")
        .eq("id", data.quoteId).eq("property_id", channel.propertyId).maybeSingle();
      const request = quoteRecord?.request ?? {};
      if (quoteError || !quoteRecord || (quoteRecord.consumed_at && !quoteRecord.booking_id)
        || (!quoteRecord.consumed_at && Date.parse(quoteRecord.expires_at) <= Date.now())
        || request.room_slug !== data.roomSlug || request.rate_plan_id !== campaignContext.ratePlanId
        || request.check_in !== data.checkIn || request.check_out !== data.checkOut) {
        throw new Error("Reservation quote does not match the validated campaign offer, room, dates and property.");
      }
    }
    const { data: result, error } = await sb.rpc("staynas_create_public_channel_reservation", {
      _sales_channel_id: channel.channelId,
      _quote_id: data.quoteId,
      _idempotency_key: data.quoteId,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _payment_method: "pay_at_property",
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
        campaign_id: campaignContext.campaignId, property_id: channel.propertyId, booking_id: row.booking_id,
        session_key: campaignContext.sessionKey, event_type: "booking_completed",
        event_key: `${campaignContext.campaignId}:${row.booking_id}:booking_completed`,
        source: campaignContext.attribution.source, medium: campaignContext.attribution.medium,
        utm_campaign: campaignContext.attribution.utm_campaign, utm_content: campaignContext.attribution.utm_content,
        utm_term: campaignContext.attribution.utm_term, referrer: campaignContext.attribution.referrer,
        metadata: { offerId: campaignContext.offerId, pricingEvidence: campaignContext.pricingEvidence, quoteId: data.quoteId },
        occurred_at: new Date().toISOString(),
      }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
      if (attributionError) console.error("[StayNas campaign attribution] Reservation created but attribution persistence failed", { code: attributionError.code, propertyId: channel.propertyId });
    }
    // Send "reservation received" email via Lovable Emails. Never let email failure block booking.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: full } = await (supabaseAdmin as any)
        .from("bookings")
        .select("reference, guest_name, guest_email, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, currency, room_id")
        .eq("id", row.booking_id as string)
        .eq("property_id", channel.propertyId)
        .eq("sales_channel_id", channel.channelId)
        .maybeSingle();
      if (full) {
        const { data: room } = await supabaseAdmin.from("rooms").select("name").eq("id", full.room_id).eq("property_id", channel.propertyId).maybeSingle();
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
            paymentState: "not_configured",
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
      paymentStatus: "unpaid" as const,
      paymentState: "not_configured" as const,
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
      .eq("property_id", propertyId)
      .eq("sales_channel_id", channel.channelId)
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
      .eq("property_id", propertyId)
      .maybeSingle();
    return { ...row, total: Number(row.total), room };
  });