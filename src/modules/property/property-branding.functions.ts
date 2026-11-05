import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const brandingSchema = z.object({
  propertyId: z.string().uuid(),
  logoUrl: z.string().url().max(2048).or(z.literal("")),
  logoDarkUrl: z.string().url().max(2048).or(z.literal("")),
  faviconUrl: z.string().url().max(2048).or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  tagline: z.string().max(160),
  description: z.string().max(1000),
  heroImageUrl: z.string().url().max(2048).or(z.literal("")),
  galleryImageUrls: z.array(z.string().url().max(2048)).max(12),
  showStayNasAttribution: z.boolean(),
});

export type PropertyBranding = z.infer<typeof brandingSchema>;

const DEFAULTS = {
  logo_url: null, logo_dark_url: null, favicon_url: null,
  primary_color: "#1e352a", secondary_color: "#c6a878",
  background_color: "#f5f4ef", text_color: "#202820",
  tagline: "", description: "", hero_image_url: null,
  gallery_image_urls: [], social_links: {}, show_staynas_attribution: true,
};

export const getPropertyBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("staynas_property_branding").select("*").eq("property_id", data.propertyId).maybeSingle();
    if (error) throw new Error(error.message);
    const b = row ?? DEFAULTS;
    return {
      propertyId: data.propertyId,
      logoUrl: b.logo_url ?? "", logoDarkUrl: b.logo_dark_url ?? "",
      faviconUrl: b.favicon_url ?? "", primaryColor: b.primary_color,
      secondaryColor: b.secondary_color, backgroundColor: b.background_color,
      textColor: b.text_color, tagline: b.tagline ?? "",
      description: b.description ?? "", heroImageUrl: b.hero_image_url ?? "",
      galleryImageUrls: Array.isArray(b.gallery_image_urls) ? b.gallery_image_urls : [],
      showStayNasAttribution: b.show_staynas_attribution ?? true,
    } satisfies PropertyBranding;
  });

export const savePropertyBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => brandingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("staynas_property_branding")
      .upsert({
        property_id: data.propertyId,
        logo_url: data.logoUrl || null,
        logo_dark_url: data.logoDarkUrl || null,
        favicon_url: data.faviconUrl || null,
        primary_color: data.primaryColor,
        secondary_color: data.secondaryColor,
        background_color: data.backgroundColor,
        text_color: data.textColor,
        tagline: data.tagline,
        description: data.description,
        hero_image_url: data.heroImageUrl || null,
        gallery_image_urls: data.galleryImageUrls,
        show_staynas_attribution: data.showStayNasAttribution,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "property_id" });
    if (error) throw new Error(error.message);
    return { success: true };
  });
