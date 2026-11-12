/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase campaign contracts are runtime-validated until generated types are refreshed. */
import { z } from "zod";

export const publicCampaignBookingSchema = z.object({
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

export type PublicCampaignBookingInput = z.infer<typeof publicCampaignBookingSchema>;

export async function resolvePublicCampaignBookingContext(
  sb: any,
  propertyId: string,
  input: PublicCampaignBookingInput & { ratePlanId?: string },
) {
  const hasCampaignContext = !!(input.campaignSlug || input.offerId || input.sessionKey);
  if (!hasCampaignContext) {
    if (input.propertySlug) {
      const { data: property, error } = await sb.from("staynas_properties")
        .select("id,slug,status,currency,timezone").eq("id", propertyId).maybeSingle();
      if (error || !property || property.status !== "active" || property.slug !== input.propertySlug
        || !/^[A-Z]{3}$/.test(String(property.currency ?? "")) || !property.timezone) {
        throw new Error("Booking property does not match the verified property domain.");
      }
    }
    return null;
  }
  if (!input.propertySlug || !input.campaignSlug || !input.offerId || !input.sessionKey || !input.ratePlanId) {
    throw new Error("Campaign booking requires a complete property, campaign, offer, session and rate-plan context.");
  }

  const [{ data: property, error: propertyError }, { data: campaign, error: campaignError }] = await Promise.all([
    sb.from("staynas_properties").select("id,slug,currency,status,timezone").eq("id", propertyId).maybeSingle(),
    sb.from("booking_campaigns").select("id,property_id,status,starts_at,ends_at")
      .eq("property_id", propertyId).eq("slug", input.campaignSlug).eq("status", "published").maybeSingle(),
  ]);
  const now = Date.now();
  if (propertyError || !property || property.status !== "active" || property.slug !== input.propertySlug
    || !/^[A-Z]{3}$/.test(String(property.currency ?? "")) || !property.timezone) {
    throw new Error("Campaign property does not match the verified booking host or has invalid property configuration.");
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
    .select("id,rate_plan_id,publication_number,rate_plan_version,snapshot_hash,room_type_assignments,currency,effective_from,effective_to")
    .eq("id", offer.rate_plan_publication_id).eq("property_id", propertyId).maybeSingle();
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: property.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (publicationError || !publication || publication.rate_plan_id !== input.ratePlanId
    || publication.currency !== property.currency
    || (publication.effective_from && publication.effective_from > localDate)
    || (publication.effective_to && publication.effective_to < localDate)) {
    throw new Error("Campaign offer does not match an effective published pricing snapshot in the property's configured currency.");
  }

  const [{ data: plan, error: planError }, { data: latest, error: latestError }, { data: selections, error: selectionError }] = await Promise.all([
    sb.from("staynas_rate_plans").select("id,active,publication_status,currency")
      .eq("id", publication.rate_plan_id).eq("property_id", propertyId).maybeSingle(),
    sb.from("staynas_rate_plan_publications").select("id")
      .eq("property_id", propertyId).eq("rate_plan_id", publication.rate_plan_id)
      .order("publication_number", { ascending: false }).limit(1).maybeSingle(),
    sb.from("campaign_room_selections").select("room_id")
      .eq("campaign_id", campaign.id).eq("property_id", propertyId),
  ]);
  if (planError || !plan || !plan.active || plan.publication_status !== "published" || plan.currency !== property.currency) {
    throw new Error("Campaign rate plan is no longer active and published for this property.");
  }
  if (latestError || latest?.id !== publication.id) {
    throw new Error("Campaign offer snapshot has been superseded. Reconfigure the offer against the latest published rate plan.");
  }
  if (selectionError || !selections?.length) throw new Error("Campaign has no room selection.");

  const roomIds = selections.map((item: any) => item.room_id);
  const { data: rooms, error: roomsError } = await sb.from("rooms")
    .select("id,catalogue_type_id").eq("property_id", propertyId).eq("status", "active").in("id", roomIds);
  const assignedTypes = new Set<string>((publication.room_type_assignments ?? []).map((item: any) => item.room_type_id));
  if (roomsError || !rooms || rooms.length !== roomIds.length
    || rooms.some((room: any) => !assignedTypes.has(room.catalogue_type_id))) {
    throw new Error("Campaign room selections do not match the published rate-plan room-type assignments.");
  }

  return {
    campaignId: campaign.id,
    offerId: offer.id,
    ratePlanId: publication.rate_plan_id,
    allowedRoomIds: new Set<string>(roomIds),
    sessionKey: input.sessionKey,
    attribution: {
      source: input.utmSource ?? null,
      medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      utm_content: input.utmContent ?? null,
      utm_term: input.utmTerm ?? null,
      referrer: input.referrer ?? null,
    },
    pricingEvidence: {
      publicationId: publication.id,
      ratePlanId: publication.rate_plan_id,
      publicationNumber: publication.publication_number,
      ratePlanVersion: publication.rate_plan_version,
      snapshotHash: publication.snapshot_hash,
      currency: publication.currency,
    },
  };
}
