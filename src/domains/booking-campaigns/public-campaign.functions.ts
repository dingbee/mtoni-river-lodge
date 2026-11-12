import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolvePublicDirectBookingChannel } from "@/lib/public-booking-channel.server";

const campaignSlug = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const campaignIdSchema = z.string().uuid();

function safeReferrer(value?: string) {
  try {
    const url = new URL(value ?? "");
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

function campaignLocalDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const getPublicBookingProperty = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ propertySlug: campaignSlug }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const sb = supabaseAdmin as any;
    const [{ data: property, error: propertyError }, { data: branding, error: brandingError }] = await Promise.all([
      sb.from("staynas_properties").select("id,slug,name,currency,timezone,status")
        .eq("id", channel.propertyId).eq("slug", data.propertySlug).maybeSingle(),
      sb.from("staynas_property_branding").select("logo_url,primary_color,secondary_color,background_color,text_color,tagline,description,hero_image_url")
        .eq("property_id", channel.propertyId).maybeSingle(),
    ]);
    if (propertyError || !property || property.status !== "active" || brandingError
      || !/^[A-Z]{3}$/.test(String(property.currency ?? "")) || !property.timezone) {
      throw new Error("Booking property does not match the verified domain or has incomplete configuration.");
    }
    return {
      property,
      branding: branding ?? {
        logo_url: null, primary_color: "#1f2937", secondary_color: "#64748b",
        background_color: "#ffffff", text_color: "#111827", tagline: null,
        description: null, hero_image_url: null,
      },
    };
  });

export const getPublicBookingCampaign = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({
    propertySlug: campaignSlug,
    campaignSlug: campaignSlug,
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("id,slug,name,currency,timezone,status").eq("id", channel.propertyId).eq("slug", data.propertySlug).maybeSingle();
    if (propertyError || !property || property.status !== "active" || property.id !== channel.propertyId
      || channel.currency !== property.currency || !/^[A-Z]{3}$/.test(property.currency ?? "") || !property.timezone) {
      throw new Error("This campaign is not published for the verified property booking domain.");
    }
    const { data: campaign, error: campaignError } = await sb.from("booking_campaigns")
      .select("id,organisation_id,property_id,slug,name,status,starts_at,ends_at")
      .eq("property_id", property.id).eq("slug", data.campaignSlug).eq("status", "published").maybeSingle();
    const now = Date.now();
    if (campaignError || !campaign || (campaign.starts_at && Date.parse(campaign.starts_at) > now)
      || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)) {
      throw new Error("This campaign is not currently available.");
    }
    const [{ data: contentRows, error: contentError }, { data: selections, error: selectionError }, { data: offers, error: offersError }, { data: branding, error: brandingError }] = await Promise.all([
      sb.from("campaign_page_content").select("version,content").eq("campaign_id", campaign.id).eq("property_id", property.id).eq("status", "published").order("version", { ascending: false }).limit(1),
      sb.from("campaign_room_selections").select("room_id,sort_order,display_config").eq("campaign_id", campaign.id).eq("property_id", property.id).order("sort_order"),
      sb.from("campaign_offers").select("id,offer_code,title,description,rate_plan_publication_id,sort_order").eq("campaign_id", campaign.id).eq("property_id", property.id).eq("active", true).order("sort_order"),
      sb.from("staynas_property_branding").select("logo_url,primary_color,secondary_color,background_color,text_color,tagline,description,hero_image_url").eq("property_id", property.id).maybeSingle(),
    ]);
    if (contentError || selectionError || offersError || brandingError || !contentRows?.length || !selections?.length || !offers?.length) {
      throw new Error("Campaign content, selected rooms or offer configuration is incomplete.");
    }
    const roomIds = selections.map((item: any) => item.room_id);
    const publicationIds = offers.map((item: any) => item.rate_plan_publication_id).filter(Boolean);
    const [{ data: rooms, error: roomsError }, { data: publications, error: publicationsError }] = await Promise.all([
      sb.from("rooms").select("id,slug,name,short_description,bed_label,bathroom_label,amenities,max_occupancy,status,catalogue_type_id").eq("property_id", property.id).eq("status", "active").in("id", roomIds),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,publication_number,rate_plan_version,code,name,currency,effective_from,effective_to,snapshot_hash,room_type_assignments").eq("property_id", property.id).in("id", publicationIds),
    ]);
    if (roomsError || publicationsError) throw new Error("Campaign booking resources could not be verified.");
    const activeRoomIds = new Set((rooms ?? []).map((room: any) => room.id));
    if (roomIds.some((id: string) => !activeRoomIds.has(id))) throw new Error("A campaign room is no longer available.");
    const publicationById = new Map((publications ?? []).map((item: any) => [item.id, item]));
    const planIds = Array.from(new Set((publications ?? []).map((item: any) => item.rate_plan_id)));
    const { data: plans, error: plansError } = await sb.from("staynas_rate_plans")
      .select("id,active,publication_status,currency").eq("property_id", property.id).in("id", planIds);
    if (plansError) throw new Error("Campaign rate-plan status could not be verified.");
    const validPlans = new Set((plans ?? []).filter((plan: any) => plan.active && plan.publication_status === "published" && plan.currency === property.currency).map((plan: any) => plan.id));
    const { data: latestPublications, error: latestError } = await sb.from("staynas_rate_plan_publications")
      .select("id,rate_plan_id,publication_number").eq("property_id", property.id).in("rate_plan_id", planIds)
      .order("publication_number", { ascending: false });
    if (latestError) throw new Error("Latest published pricing snapshots could not be verified.");
    const latestPublicationIds = new Set<string>();
    const latestSeen = new Set<string>();
    for (const latest of latestPublications ?? []) {
      if (!latestSeen.has(latest.rate_plan_id)) {
        latestSeen.add(latest.rate_plan_id);
        latestPublicationIds.add(latest.id);
      }
    }
    const validOffers = offers.flatMap((offer: any) => {
      const publication: any = publicationById.get(offer.rate_plan_publication_id);
      const today = campaignLocalDate(property.timezone);
      const assignedRoomTypeIds = new Set<string>((publication?.room_type_assignments ?? []).map((item: any) => item.room_type_id));
      if (!publication || !latestPublicationIds.has(publication.id)
        || publication.currency !== property.currency || !validPlans.has(publication.rate_plan_id)
        || (publication.effective_from && publication.effective_from > today)
        || (publication.effective_to && publication.effective_to < today)
        || (rooms ?? []).some((room: any) => !assignedRoomTypeIds.has(room.catalogue_type_id))) return [];
      return [{
        ...offer, ratePlanId: publication.rate_plan_id, publicationId: publication.id,
        publicationNumber: publication.publication_number, ratePlanVersion: publication.rate_plan_version,
        snapshotHash: publication.snapshot_hash, currency: publication.currency,
      }];
    });
    if (!validOffers.length) throw new Error("No active campaign offer has a valid published rate snapshot in the property's configured currency.");
    return {
      property: { slug: property.slug, name: property.name, currency: property.currency, timezone: property.timezone },
      campaign: { id: campaign.id, slug: campaign.slug, name: campaign.name, startsAt: campaign.starts_at, endsAt: campaign.ends_at },
      content: contentRows[0].content,
      rooms: rooms ?? [],
      offers: validOffers,
      branding: {
        logoUrl: branding?.logo_url ?? "",
        primaryColor: branding?.primary_color ?? "#1e352a",
        secondaryColor: branding?.secondary_color ?? "#c6a878",
        backgroundColor: branding?.background_color ?? "#f5f4ef",
        textColor: branding?.text_color ?? "#202820",
        tagline: branding?.tagline ?? "",
        description: branding?.description ?? "",
        heroImageUrl: branding?.hero_image_url ?? "",
      },
    };
  });

export const recordPublicBookingCampaignEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    campaignId: campaignIdSchema,
    propertySlug: campaignSlug,
    sessionKey: z.string().trim().min(16).max(140),
    eventId: z.string().uuid(),
    eventType: z.enum(["page_view","booking_click"]),
    offerId: z.string().uuid().optional(),
    source: z.string().trim().max(200).optional(),
    medium: z.string().trim().max(200).optional(),
    utmCampaign: z.string().trim().max(200).optional(),
    utmContent: z.string().trim().max(200).optional(),
    utmTerm: z.string().trim().max(200).optional(),
    referrer: z.string().url().max(2000).optional(),
  }).superRefine((value, ctx) => {
    if (value.eventType === "booking_click" && !value.offerId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["offerId"], message: "Booking-click attribution requires a campaign offer." });
    }
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("id,status").eq("id", channel.propertyId).eq("slug", data.propertySlug).maybeSingle();
    if (propertyError || !property || property.status !== "active" || property.id !== channel.propertyId) throw new Error("Campaign attribution property does not match the verified booking domain.");
    const { data: campaign, error: campaignError } = await sb.from("booking_campaigns")
      .select("id,property_id,status,starts_at,ends_at,slug").eq("id", data.campaignId).eq("property_id", property.id).maybeSingle();
    const now = Date.now();
    if (campaignError || !campaign || campaign.status !== "published"
      || (campaign.starts_at && Date.parse(campaign.starts_at) > now)
      || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)) throw new Error("Campaign attribution context is invalid.");
    if (data.offerId) {
      const { data: offer, error: offerError } = await sb.from("campaign_offers").select("id")
        .eq("id", data.offerId).eq("campaign_id", data.campaignId).eq("property_id", property.id).eq("active", true).maybeSingle();
      if (offerError || !offer) throw new Error("Campaign offer attribution is invalid.");
    }
    const eventKey = `${data.campaignId}:${data.eventId}:${data.eventType}`;
    const { error } = await sb.from("campaign_attribution").upsert({
      campaign_id: data.campaignId,
      property_id: property.id,
      booking_id: null,
      session_key: data.sessionKey,
      event_type: data.eventType,
      event_key: eventKey,
      source: data.source ?? null,
      medium: data.medium ?? null,
      utm_campaign: data.utmCampaign ?? null,
      utm_content: data.utmContent ?? null,
      utm_term: data.utmTerm ?? null,
      referrer: data.referrer ?? null,
      metadata: data.offerId ? { offerId: data.offerId } : {},
      occurred_at: new Date().toISOString(),
    }, { onConflict: "property_id,event_key", ignoreDuplicates: true });
    if (error) throw new Error("Campaign attribution could not be persisted.");

    const externalReferrer = (() => {
      try { return !!data.referrer && new URL(data.referrer).hostname !== channel.hostname; }
      catch { return false; }
    })();
    const touch = {
      source: data.source ?? null, medium: data.medium ?? null,
      utm_campaign: data.utmCampaign ?? null, utm_content: data.utmContent ?? null,
      utm_term: data.utmTerm ?? null, referrer: safeReferrer(data.referrer),
      landing_page: `/p/${data.propertySlug}/campaign/${campaign.slug}`,
    };
    const { data: attribution, error: durableAttributionError } = await sb.rpc("staynas_upsert_booking_attribution", {
      _property_id: property.id,
      _organisation_id: channel.organisationId,
      _session_key: data.sessionKey,
      _campaign_id: data.campaignId,
      _campaign_offer_id: data.offerId ?? null,
      _touch: touch,
      _touch_at: new Date().toISOString(),
      _is_external_acquisition: Boolean(data.source || data.medium || data.utmCampaign || externalReferrer),
    });
    if (durableAttributionError || !attribution?.attribution_id) {
      throw new Error("Campaign analytics attribution could not be initialized.");
    }
    const analyticsEventType = data.eventType === "page_view" ? "campaign_page_viewed" : "campaign_cta_clicked";
    const { error: analyticsError } = await sb.rpc("staynas_record_booking_analytics_event", {
      _property_id: property.id,
      _organisation_id: channel.organisationId,
      _event_type: analyticsEventType,
      _event_key: `cps6:${data.campaignId}:${data.eventId}:${data.eventType}`,
      _event_source: "browser_observed",
      _attribution_id: attribution.attribution_id,
      _campaign_id: data.campaignId,
      _session_key: data.sessionKey,
      _traffic_source: data.source ?? null,
      _traffic_medium: data.medium ?? null,
      _utm_campaign: data.utmCampaign ?? null,
      _utm_content: data.utmContent ?? null,
      _utm_term: data.utmTerm ?? null,
      _referrer: safeReferrer(data.referrer),
      _landing_page: `/p/${data.propertySlug}/campaign/${campaign.slug}`,
      _metadata: { offer_id: data.offerId ?? null },
    });
    if (analyticsError) throw new Error("Campaign analytics event could not be recorded.");
    return { recorded: true };
  });


export const recordPublicDirectBookingAnalyticsEvent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    propertySlug: campaignSlug,
    sessionKey: z.string().trim().min(16).max(140),
    eventId: z.string().uuid(),
    source: z.string().trim().max(200).optional(),
    medium: z.string().trim().max(200).optional(),
    utmCampaign: z.string().trim().max(200).optional(),
    utmContent: z.string().trim().max(200).optional(),
    utmTerm: z.string().trim().max(200).optional(),
    referrer: z.string().url().max(2000).optional(),
    landingPage: z.string().trim().regex(/^\/p\/[a-z0-9-]+\/book$/),
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("id,organisation_id,status").eq("id", channel.propertyId).eq("slug", data.propertySlug).maybeSingle();
    if (propertyError || !property || property.status !== "active" || property.organisation_id !== channel.organisationId)
      throw new Error("Booking analytics property does not match the verified public domain.");
    const externalReferrer = (() => {
      try { return !!data.referrer && new URL(data.referrer).hostname !== channel.hostname; }
      catch { return false; }
    })();
    const touch = { source: data.source ?? null, medium: data.medium ?? null, utm_campaign: data.utmCampaign ?? null,
      utm_content: data.utmContent ?? null, utm_term: data.utmTerm ?? null, referrer: safeReferrer(data.referrer),
      landing_page: data.landingPage };
    const { data: attribution, error: attributionError } = await sb.rpc("staynas_upsert_booking_attribution", {
      _property_id: property.id, _organisation_id: channel.organisationId, _session_key: data.sessionKey,
      _touch: touch, _touch_at: new Date().toISOString(),
      _is_external_acquisition: Boolean(data.source || data.medium || data.utmCampaign || externalReferrer),
    });
    if (attributionError || !attribution?.attribution_id) throw new Error("Booking page attribution could not be initialized.");
    const { error: eventError } = await sb.rpc("staynas_record_booking_analytics_event", {
      _property_id: property.id, _organisation_id: channel.organisationId,
      _event_type: "booking_page_viewed", _event_key: "cps6:direct:" + data.eventId + ":view",
      _event_source: "browser_observed", _attribution_id: attribution.attribution_id,
      _session_key: data.sessionKey, _traffic_source: data.source ?? null, _traffic_medium: data.medium ?? null,
      _utm_campaign: data.utmCampaign ?? null, _utm_content: data.utmContent ?? null, _utm_term: data.utmTerm ?? null,
      _referrer: data.referrer ?? null, _landing_page: data.landingPage,
    });
    if (eventError) throw new Error("Booking page analytics event could not be recorded.");
    return { recorded: true };
  });

/** Resolve a short campaign slug on the property selected by the current booking-domain configuration. */
