import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

/** List CMS pages (staff only). */
export const listCmsPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cms_pages")
      .select("id, slug, title, description, status, route_path, published_at, scheduled_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Get a single CMS page + its blocks. */
export const getCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const [page, blocks, versions] = await Promise.all([
      context.supabase.from("cms_pages").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("cms_blocks").select("*").eq("page_id", data.id).order("position"),
      context.supabase.from("cms_page_versions").select("id, version, note, created_at").eq("page_id", data.id).order("version", { ascending: false }),
    ]);
    if (page.error) throw page.error;
    if (blocks.error) throw blocks.error;
    if (versions.error) throw versions.error;
    return { page: page.data, blocks: blocks.data ?? [], versions: versions.data ?? [] };
  });

/** AI-ready interface for the Pages domain (Phase 1 = deterministic placeholders). */
export const pagesAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("pages.suggest", input),
  analyze: async (input: unknown) => aiPlaceholder("pages.analyze", input),
  summarize: async (input: unknown) => aiPlaceholder("pages.summarize", input),
});