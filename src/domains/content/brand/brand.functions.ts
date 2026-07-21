import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

export const listBrandTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brand_tokens")
      .select("*")
      .order("category")
      .order("label");
    if (error) throw error;
    return data ?? [];
  });

export type BrandTokenInput = {
  id?: string;
  key: string;
  category: string;
  label: string;
  value: unknown;
  notes?: string | null;
};

export const saveBrandToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: BrandTokenInput) => d)
  .handler(async ({ data, context }) => {
    const payload = {
      key: data.key,
      category: data.category,
      label: data.label,
      value: (data.value ?? {}) as never,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("brand_tokens").update(payload).eq("id", data.id).select("*").single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("brand_tokens")
      .upsert(payload, { onConflict: "key" })
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteBrandToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("brand_tokens").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Public brand context helper — deterministic today; future AI calls will consume it. */
export const getBrandContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("brand_tokens").select("key, category, label, value");
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grouped: Record<string, Array<{ key: string; label: string; value: any }>> = {};
    for (const row of data ?? []) {
      (grouped[row.category] ??= []).push({ key: row.key, label: row.label, value: row.value });
    }
    return grouped;
  });

export const brandAi = defineAiInterface({
  summarize: async (input: unknown) => aiPlaceholder("brand.summarize_voice", input),
});