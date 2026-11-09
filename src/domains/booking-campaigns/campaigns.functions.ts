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
