import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

export const listSeoOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("seo_overrides")
      .select("*")
      .order("route_path");
    if (error) throw error;
    return data ?? [];
  });

export const getSeoOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routePath: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("seo_overrides")
      .select("*")
      .eq("route_path", data.routePath)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export interface SeoOverrideInput {
  route_path: string;
  title?: string | null;
  description?: string | null;
  keywords?: string[] | null;
  canonical_url?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_card?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  twitter_image?: string | null;
  robots?: string | null;
  index_status?: boolean;
  schema_type?: string | null;
  notes?: string | null;
}

export const upsertSeoOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SeoOverrideInput) => input)
  .handler(async ({ data, context }) => {
    const payload = { ...data, updated_by: context.userId, updated_at: new Date().toISOString() };
    const { data: row, error } = await context.supabase
      .from("seo_overrides")
      .upsert(payload, { onConflict: "route_path" })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deleteSeoOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { routePath: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("seo_overrides")
      .delete()
      .eq("route_path", data.routePath);
    if (error) throw error;
    return { ok: true };
  });

export const seoAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("seo.suggest_title", input),
  analyze: async (input: unknown) => aiPlaceholder("seo.audit_page", input),
  recommend: async (input: unknown) => aiPlaceholder("seo.recommend_keywords", input),
});