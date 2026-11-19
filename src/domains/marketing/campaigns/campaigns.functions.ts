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
    const { data: propertyId, error: propertyError } = await context.supabase.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const { data, error } = await (context.supabase as any).from("campaigns")
      .select("*").or(`property_id.eq.${propertyId},property_id.is.null`)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CampaignInput) => d)
  .handler(async ({ data, context }) => {
    const { data: propertyId, error: propertyError } = await context.supabase.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const { data: property, error: currencyError } = await context.supabase.from("staynas_properties").select("currency").eq("id", propertyId).single();
    const propertyCurrency = String(property?.currency ?? "").trim().toUpperCase();
    if (currencyError || !/^[A-Z]{3}$/.test(propertyCurrency)) throw new Error("The active property must have a valid operating currency before saving a campaign.");
    const requestedCurrency = String(data.currency ?? propertyCurrency).trim().toUpperCase();
    if (requestedCurrency !== propertyCurrency) throw new Error(`Campaign budgets must use the active property's operating currency (${propertyCurrency}).`);
    const sb: any = context.supabase;
    const payload = {
      property_id: propertyId,
      name: data.name,
      objective: data.objective ?? null,
      audience: data.audience ?? null,
      landing_page: data.landing_page ?? null,
      start_date: data.start_date || null,
      end_date: data.end_date || null,
      budget: data.budget ?? null,
      currency: propertyCurrency,
      status: data.status ?? "draft",
      utm_source: data.utm_source ?? null,
      utm_medium: data.utm_medium ?? null,
      utm_campaign: data.utm_campaign ?? null,
      utm_term: data.utm_term ?? null,
      utm_content: data.utm_content ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: existing, error: existingError } = await sb.from("campaigns")
        .select("id, property_id, currency").eq("id", data.id).maybeSingle();
      if (existingError || !existing) throw new Error(existingError?.message ?? "Campaign not found.");
      if (existing.property_id && existing.property_id !== propertyId) throw new Error("Campaign belongs to another property.");
      if (existing.currency && String(existing.currency).toUpperCase() !== propertyCurrency) throw new Error("This legacy campaign has a different stored currency. Its budget cannot be relabelled; create a new campaign in the property's operating currency.");
      const { data: row, error } = await sb.from("campaigns").update(payload).eq("id", data.id).select("*").single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await sb.from("campaigns")
      .insert({ ...payload, created_by: context.userId })
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: propertyId, error: propertyError } = await context.supabase.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const { error } = await (context.supabase as any).from("campaigns").delete().eq("id", data.id).eq("property_id", propertyId);
    if (error) throw error;
    return { ok: true };
  });

export const campaignsAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("campaigns.suggest_utm", input),
  recommend: async (input: unknown) => aiPlaceholder("campaigns.recommend_audience", input),
});