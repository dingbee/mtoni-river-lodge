import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("id, name, objective, audience, landing_page, start_date, end_date, budget, currency, status, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const campaignsAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("campaigns.suggest_utm", input),
  recommend: async (input: unknown) => aiPlaceholder("campaigns.recommend_audience", input),
});