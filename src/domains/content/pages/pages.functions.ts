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

export const createCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string; title: string; route_path?: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("cms_pages")
      .insert({ slug: data.slug, title: data.title, route_path: data.route_path ?? null, status: "draft" })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const upsertCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    title?: string;
    slug?: string;
    description?: string | null;
    route_path?: string | null;
    status?: "draft" | "scheduled" | "published" | "archived";
    scheduled_at?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("cms_pages").update(patch as never).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const publishCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cms_pages")
      .update({ status: "published", published_at: new Date().toISOString(), scheduled_at: null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cms_pages").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export interface CmsBlockPatch {
  id?: string;
  page_id: string;
  type: string;
  position: number;
  data: Record<string, unknown>;
}

export const saveCmsBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pageId: string; blocks: CmsBlockPatch[] }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.from("cms_blocks").delete().eq("page_id", data.pageId);
    if (data.blocks.length) {
      const { error } = await context.supabase.from("cms_blocks").insert(
        data.blocks.map((b, i) => ({
          page_id: data.pageId,
          type: b.type,
          position: i,
          data: b.data as never,
        })),
      );
      if (error) throw error;
    }
    return { ok: true };
  });

/** AI-ready interface for the Pages domain (Phase 1 = deterministic placeholders). */
export const pagesAi = defineAiInterface({
  suggest: async (input: unknown) => aiPlaceholder("pages.suggest", input),
  analyze: async (input: unknown) => aiPlaceholder("pages.analyze", input),
  summarize: async (input: unknown) => aiPlaceholder("pages.summarize", input),
});