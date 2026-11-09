import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedTenantActor } from "@/domains/commercial/subscription.functions";
import { assertCommercialEntitlement } from "@/domains/commercial/entitlement.functions";

const campaignSlug = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const campaignName = z.string().trim().min(2).max(160);

const contentSchema = z.object({
  headline: z.string().trim().min(2).max(160),
  subheadline: z.string().trim().max(240).default(""),
  description: z.string().trim().max(5000).default(""),
  highlights: z.array(z.string().trim().min(1).max(240)).max(12).default([]),
  inclusions: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  terms: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  faqs: z.array(z.object({
    question: z.string().trim().min(2).max(240),
    answer: z.string().trim().min(2).max(1200),
  })).max(20).default([]),
  ctaLabel: z.string().trim().min(2).max(60).default("Book this offer"),
  contact: z.object({
    email: z.string().trim().email().max(255).optional(),
    phone: z.string().trim().max(40).optional(),
    whatsapp: z.string().trim().max(40).optional(),
  }).default({}),
  seo: z.object({
    title: z.string().trim().max(160).default(""),
    description: z.string().trim().max(320).default(""),
    imageUrl: z.string().url().max(2000).optional(),
  }).default({}),
});

type ServerContext = { supabase: unknown; userId: string };
type AdminQuery = PromiseLike<{ data: any; error: any }> & {
  select(columns?: string): AdminQuery;
  eq(column: string, value: unknown): AdminQuery;
  order(column: string, options?: { ascending?: boolean }): AdminQuery;
  limit(count: number): AdminQuery;
  maybeSingle(): Promise<{ data: any; error: any }>;
  insert(values: unknown): AdminQuery;
  update(values: unknown): AdminQuery;
};
type CampaignAdmin = { from(table: string): AdminQuery };

async function resolveCampaignAdmin(context: ServerContext) {
  const actor = await resolveVerifiedTenantActor(context);
  if (!["owner", "admin", "manager", "marketing"].includes(actor.membershipRole)) {
    throw new Error("Forbidden: property owner, manager, admin or marketing access is required.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { actor, admin: supabaseAdmin as unknown as CampaignAdmin };
}

export const listMyBookingCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const { data, error } = await admin.from("booking_campaigns")
      .select("id, slug, name, status, starts_at, ends_at, published_at, created_at, updated_at")
      .eq("property_id", actor.propertyId)
      .eq("organisation_id", actor.organisationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load campaigns for the selected property.");
    return data ?? [];
  });

export const createMyBookingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    name: campaignName,
    slug: campaignSlug,
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
  }).superRefine((value, ctx) => {
    if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Campaign end must follow its start." });
    }
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const entitlement = await assertCommercialEntitlement(context as ServerContext, "campaign_studio");
    if (!entitlement.allowed) throw new Error(entitlement.reason);
    const { data: created, error } = await admin.from("booking_campaigns").insert({
      organisation_id: actor.organisationId,
      property_id: actor.propertyId,
      slug: data.slug,
      name: data.name,
      status: "draft",
      starts_at: data.startsAt ?? null,
      ends_at: data.endsAt ?? null,
      created_by: actor.userId,
      updated_by: actor.userId,
    }).select("id, slug, name, status").maybeSingle();
    if (error || !created) throw new Error("Campaign draft could not be created. Check the campaign slug and try again.");
    return created;
  });

export const saveMyBookingCampaignContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    campaignId: z.string().uuid(),
    content: contentSchema,
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const entitlement = await assertCommercialEntitlement(context as ServerContext, "campaign_studio");
    if (!entitlement.allowed) throw new Error(entitlement.reason);
    const { data: campaign, error: campaignError } = await admin.from("booking_campaigns")
      .select("id, status").eq("id", data.campaignId)
      .eq("property_id", actor.propertyId).eq("organisation_id", actor.organisationId).maybeSingle();
    if (campaignError || !campaign) throw new Error("Campaign not found in the selected property.");
    if (campaign.status !== "draft" && campaign.status !== "paused") {
      throw new Error("Only draft or paused campaigns can receive content edits.");
    }
    const { data: latest, error: latestError } = await admin.from("campaign_page_content")
      .select("version").eq("campaign_id", data.campaignId)
      .eq("property_id", actor.propertyId).order("version", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw new Error("Unable to determine the next campaign content version.");
    const version = Number(latest?.version ?? 0) + 1;
    const { data: saved, error: saveError } = await admin.from("campaign_page_content").insert({
      campaign_id: data.campaignId,
      property_id: actor.propertyId,
      version,
      status: "draft",
      content: data.content,
      created_by: actor.userId,
      updated_by: actor.userId,
    }).select("id, campaign_id, version, status, content").maybeSingle();
    if (saveError || !saved) throw new Error("Campaign content version could not be saved.");
    return saved;
  });


const campaignIdSchema = z.string().uuid();

export const listMyCampaignStudioResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const sb = admin as any;
    const [{ data: property, error: propertyError }, { data: rooms, error: roomsError }, { data: publications, error: publicationsError }, { data: plans, error: plansError }] = await Promise.all([
      sb.from("staynas_properties").select("id,currency").eq("id", actor.propertyId).eq("organisation_id", actor.organisationId).eq("status", "active").maybeSingle(),
      sb.from("rooms").select("id,slug,name,max_occupancy,status").eq("property_id", actor.propertyId).eq("status", "active").order("name"),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,publication_number,rate_plan_version,code,name,currency,effective_from,effective_to,snapshot_hash,published_at").eq("property_id", actor.propertyId).order("published_at", { ascending: false }),
      sb.from("staynas_rate_plans").select("id,code,name,currency,publication_status,active").eq("property_id", actor.propertyId).eq("publication_status", "published").eq("active", true).order("name"),
    ]);
    if (propertyError || !property || !/^[A-Z]{3}$/.test(property.currency ?? "")) throw new Error("The selected property has no valid configured currency.");
    if (roomsError || publicationsError || plansError) throw new Error("Campaign resources could not be loaded.");
    const activePlanIds = new Set((plans ?? []).map((plan: any) => plan.id));
    const today = new Date().toISOString().slice(0, 10);
    const validPublications = (publications ?? []).filter((publication: any) =>
      activePlanIds.has(publication.rate_plan_id)
      && publication.currency === property.currency
      && (!publication.effective_from || publication.effective_from <= today)
      && (!publication.effective_to || publication.effective_to >= today));
    return { currency: property.currency, rooms: rooms ?? [], publications: validPublications };
  });

export const configureMyBookingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    campaignId: campaignIdSchema,
    roomIds: z.array(z.string().uuid()).min(1).max(100),
    publicationId: z.string().uuid(),
    offerCode: campaignSlug,
    offerTitle: z.string().trim().min(2).max(160),
    offerDescription: z.string().trim().max(1000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const entitlement = await assertCommercialEntitlement(context as ServerContext, "campaign_studio");
    if (!entitlement.allowed) throw new Error(entitlement.reason);
    const { data: result, error } = await (admin as any).rpc("cps03_configure_booking_campaign", {
      _campaign_id: data.campaignId,
      _property_id: actor.propertyId,
      _organisation_id: actor.organisationId,
      _room_ids: data.roomIds,
      _publication_id: data.publicationId,
      _offer_code: data.offerCode,
      _offer_title: data.offerTitle,
      _offer_description: data.offerDescription ?? null,
      _actor_id: actor.userId,
    });
    if (error || result?.ok !== true) throw new Error(error?.message ?? "Campaign offer configuration failed.");
    return result;
  });

export const publishMyBookingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: campaignIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const sb = admin as any;
    const { data: activeCampaigns, error: countError } = await sb.from("booking_campaigns")
      .select("id,ends_at").eq("property_id", actor.propertyId).eq("organisation_id", actor.organisationId).eq("status", "published");
    if (countError) throw new Error("Active campaign usage could not be calculated.");
    const now = Date.now();
    const used = (activeCampaigns ?? []).filter((campaign: any) => !campaign.ends_at || Date.parse(campaign.ends_at) > now).length;
    const entitlement = await assertCommercialEntitlement(context as ServerContext, "campaign_studio", {
      usage: { metric: "active_campaigns", used, scope: "property", period: "concurrent" },
    });
    if (!entitlement.allowed) throw new Error(entitlement.reason);
    const limit = entitlement.usage?.limit;
    if (!Number.isInteger(limit) || (limit as number) < 0) throw new Error("A valid founder-published active campaign quota is required.");
    const { data: result, error } = await sb.rpc("cps03_publish_booking_campaign", {
      _campaign_id: data.campaignId,
      _property_id: actor.propertyId,
      _organisation_id: actor.organisationId,
      _actor_id: actor.userId,
      _usage_limit: limit,
    });
    if (error || result?.ok !== true) throw new Error(error?.message ?? "Campaign publication failed.");
    return result;
  });

export const transitionMyBookingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    campaignId: campaignIdSchema,
    action: z.enum(["pause", "expire", "archive"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    // Lifecycle safety actions (pause/archive/expire) remain available to authorised
    // property managers even if a subscription lapses; publication stays entitlement-gated.
    const { data: result, error } = await (admin as any).rpc("cps03_transition_booking_campaign", {
      _campaign_id: data.campaignId,
      _property_id: actor.propertyId,
      _organisation_id: actor.organisationId,
      _actor_id: actor.userId,
      _action: data.action,
    });
    if (error || result?.ok !== true) throw new Error(error?.message ?? "Campaign lifecycle transition failed.");
    return result;
  });

export const previewMyBookingCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campaignId: campaignIdSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const sb = admin as any;
    const [{ data: campaign, error: campaignError }, { data: contents, error: contentError }, { data: rooms, error: roomError }, { data: offers, error: offerError }] = await Promise.all([
      sb.from("booking_campaigns").select("id,slug,name,status,starts_at,ends_at").eq("id", data.campaignId).eq("property_id", actor.propertyId).eq("organisation_id", actor.organisationId).maybeSingle(),
      sb.from("campaign_page_content").select("version,status,content").eq("campaign_id", data.campaignId).eq("property_id", actor.propertyId).order("version", { ascending: false }).limit(1),
      sb.from("campaign_room_selections").select("room_id,rooms(id,slug,name)").eq("campaign_id", data.campaignId).eq("property_id", actor.propertyId),
      sb.from("campaign_offers").select("id,offer_code,title,description,rate_plan_publication_id,active").eq("campaign_id", data.campaignId).eq("property_id", actor.propertyId).eq("active", true),
    ]);
    if (campaignError || !campaign || contentError || roomError || offerError) throw new Error("Campaign preview could not be loaded.");
    return { campaign, content: contents?.[0] ?? null, rooms: rooms ?? [], offers: offers ?? [] };
  });

export const getPublicBookingCampaign = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({
    propertySlug: campaignSlug,
    campaignSlug: campaignSlug,
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("id,slug,name,currency,timezone,status").eq("slug", data.propertySlug).maybeSingle();
    if (propertyError || !property || property.status !== "active" || !/^[A-Z]{3}$/.test(property.currency ?? "")) {
      throw new Error("This campaign property is unavailable or has no valid configured currency.");
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
      sb.from("rooms").select("id,slug,name,short_description,bed_label,bathroom_label,amenities,max_occupancy,status").eq("property_id", property.id).eq("status", "active").in("id", roomIds),
      sb.from("staynas_rate_plan_publications").select("id,rate_plan_id,publication_number,rate_plan_version,code,name,currency,effective_from,effective_to,snapshot_hash").eq("property_id", property.id).in("id", publicationIds),
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
    const validOffers = offers.flatMap((offer: any) => {
      const publication: any = publicationById.get(offer.rate_plan_publication_id);
      if (!publication || publication.currency !== property.currency || !validPlans.has(publication.rate_plan_id)) return [];
      return [{ ...offer, ratePlanId: publication.rate_plan_id, publicationId: publication.id, publicationNumber: publication.publication_number, currency: publication.currency }];
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
    sessionKey: z.string().trim().min(16).max(200),
    eventType: z.enum(["page_view","booking_click","booking_started","lead_submitted","booking_completed"]),
    offerId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
    source: z.string().trim().max(200).optional(),
    medium: z.string().trim().max(200).optional(),
    utmCampaign: z.string().trim().max(200).optional(),
    utmContent: z.string().trim().max(200).optional(),
    utmTerm: z.string().trim().max(200).optional(),
    referrer: z.string().url().max(2000).optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("id,status").eq("slug", data.propertySlug).maybeSingle();
    if (propertyError || !property || property.status !== "active") throw new Error("Campaign property is unavailable.");
    const { data: campaign, error: campaignError } = await sb.from("booking_campaigns")
      .select("id,property_id,status,starts_at,ends_at").eq("id", data.campaignId).eq("property_id", property.id).maybeSingle();
    const now = Date.now();
    if (campaignError || !campaign || campaign.status !== "published"
      || (campaign.starts_at && Date.parse(campaign.starts_at) > now)
      || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)) throw new Error("Campaign attribution context is invalid.");
    if (data.offerId) {
      const { data: offer, error: offerError } = await sb.from("campaign_offers").select("id")
        .eq("id", data.offerId).eq("campaign_id", data.campaignId).eq("property_id", property.id).eq("active", true).maybeSingle();
      if (offerError || !offer) throw new Error("Campaign offer attribution is invalid.");
    }
    if (data.bookingId) {
      const { data: booking, error: bookingError } = await sb.from("bookings").select("id")
        .eq("id", data.bookingId).eq("property_id", property.id).maybeSingle();
      if (bookingError || !booking) throw new Error("Booking attribution property mismatch.");
    }
    const eventKey = `${data.sessionKey}:${data.eventType}`;
    const { error } = await sb.from("campaign_attribution").upsert({
      campaign_id: data.campaignId,
      property_id: property.id,
      booking_id: data.bookingId ?? null,
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
    return { recorded: true };
  });


/** Resolve a short campaign slug on the property selected by the current booking-domain configuration. */
export const resolveConfiguredPropertyCampaignSlug = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ campaignSlug }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: propertyId, error: resolverError } = await sb.rpc("staynas_booking_property_id");
    if (resolverError || !propertyId) return null;
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("id,slug,status").eq("id", propertyId).maybeSingle();
    if (propertyError || !property || property.status !== "active") return null;
    const { data: campaign, error: campaignError } = await sb.from("booking_campaigns")
      .select("id,starts_at,ends_at").eq("property_id", property.id)
      .eq("slug", data.campaignSlug).eq("status", "published").maybeSingle();
    const now = Date.now();
    if (campaignError || !campaign || (campaign.starts_at && Date.parse(campaign.starts_at) > now)
      || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)) return null;
    return { propertySlug: property.slug, campaignSlug: data.campaignSlug };
  });


export const getMyBookingCampaignAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { actor, admin } = await resolveCampaignAdmin(context as ServerContext);
    const baseEntitlement = await assertCommercialEntitlement(context as ServerContext, "campaign_studio");
    if (!baseEntitlement.allowed) throw new Error(baseEntitlement.reason);
    const advanced = await assertCommercialEntitlement(context as ServerContext, "campaign_analytics_advanced");
    const sb = admin as any;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [{ data: campaigns, error: campaignsError }, { data: events, error: eventsError }] = await Promise.all([
      sb.from("booking_campaigns").select("id,name,slug,status").eq("property_id", actor.propertyId).eq("organisation_id", actor.organisationId).order("created_at", { ascending: false }),
      sb.from("campaign_attribution").select("campaign_id,event_type,booking_id,occurred_at,source,medium,utm_campaign,utm_content,utm_term")
        .eq("property_id", actor.propertyId).gte("occurred_at", since),
    ]);
    if (campaignsError || eventsError) throw new Error("Campaign analytics evidence could not be loaded.");
    const byCampaign = new Map<string, any>();
    for (const campaign of campaigns ?? []) byCampaign.set(campaign.id, {
      campaignId: campaign.id, name: campaign.name, slug: campaign.slug, status: campaign.status,
      pageViews: 0, bookingClicks: 0, bookingStarts: 0, completedBookings: 0,
      uniqueBookings: new Set<string>(), sources: new Map<string, number>(),
    });
    for (const event of events ?? []) {
      const item = byCampaign.get(event.campaign_id);
      if (!item) continue;
      if (event.event_type === "page_view") item.pageViews += 1;
      if (event.event_type === "booking_click") item.bookingClicks += 1;
      if (event.event_type === "booking_started") item.bookingStarts += 1;
      if (event.event_type === "booking_completed") {
        item.completedBookings += 1;
        if (event.booking_id) item.uniqueBookings.add(event.booking_id);
      }
      const source = event.source || event.utm_campaign;
      if (advanced.allowed && source) item.sources.set(source, (item.sources.get(source) ?? 0) + 1);
    }
    return {
      windowDays: 30,
      advancedAnalyticsEnabled: advanced.allowed,
      campaigns: Array.from(byCampaign.values()).map((item) => ({
        campaignId: item.campaignId, name: item.name, slug: item.slug, status: item.status,
        pageViews: item.pageViews, bookingClicks: item.bookingClicks, bookingStarts: item.bookingStarts,
        completedBookings: item.completedBookings, uniqueBookings: item.uniqueBookings.size,
        clickThroughRate: item.pageViews ? item.bookingClicks / item.pageViews : 0,
        bookingConversionRate: item.bookingClicks ? item.uniqueBookings.size / item.bookingClicks : 0,
        ...(advanced.allowed ? { sources: Array.from(item.sources.entries()).map(([source, count]) => ({ source, count })) } : {}),
      })),
    };
  });
