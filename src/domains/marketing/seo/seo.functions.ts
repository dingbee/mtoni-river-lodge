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

export const seoAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("seo.suggest_title", input),
  analyze: async (input: unknown) => aiPlaceholder("seo.audit_page", input),
  recommend: async (input: unknown) => aiPlaceholder("seo.recommend_keywords", input),
});