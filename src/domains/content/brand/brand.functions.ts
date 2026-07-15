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