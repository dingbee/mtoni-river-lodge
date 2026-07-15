import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

export const listMediaAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { folderId?: string | null; search?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("media_assets")
      .select("id, filename, url, mime_type, size_bytes, width, height, alt_text, folder_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.folderId) q = q.eq("folder_id", data.folderId);
    if (data.search && data.search.length > 0) q = q.ilike("filename", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getMediaUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assetId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("media_usage")
      .select("*")
      .eq("asset_id", data.assetId);
    if (error) throw error;
    return rows ?? [];
  });

export const mediaAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("media.suggest_alt_text", input),
  analyze: async (input: unknown) => aiPlaceholder("media.detect_duplicates", input),
});