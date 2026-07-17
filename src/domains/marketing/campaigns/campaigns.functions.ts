import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

export type CampaignInput = {
  id?: string;
  name: string;
  objective?: string | null;
  audience?: string | null;
  landing_page?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  currency?: string | null;
  status?: "draft" | "scheduled" | "running" | "paused" | "completed" | "archived";
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  notes?: string | null;
};

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CampaignInput) => d)
  .handler(async ({ data, context }) => {
    const payload = {
      name: data.name,
      objective: data.objective ?? null,
      audience: data.audience ?? null,
      landing_page: data.landing_page ?? null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      budget: data.budget ?? null,
      currency: data.currency ?? "USD",
      status: data.status ?? "draft",
      utm_source: data.utm_source ?? null,
      utm_medium: data.utm_medium ?? null,
      utm_campaign: data.utm_campaign ?? null,
      utm_term: data.utm_term ?? null,
      utm_content: data.utm_content ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("campaigns").update(payload).eq("id", data.id).select("*").single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("campaigns")
      .insert({ ...payload, created_by: context.userId })
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const campaignsAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("campaigns.suggest_utm", input),
  recommend: async (input: unknown) => aiPlaceholder("campaigns.recommend_audience", input),
});