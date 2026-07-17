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

/** Get-or-create a well-known CMS page by slug (used by Homepage/Rooms/Experiences/Gallery editors). */
export const ensureCmsPageBySlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string; title: string; route_path?: string; description?: string }) => input)
  .handler(async ({ data, context }) => {
    const existing = await context.supabase
      .from("cms_pages").select("id").eq("slug", data.slug).maybeSingle();
    if (existing.data?.id) return { id: existing.data.id };
    const { data: row, error } = await context.supabase
      .from("cms_pages")
      .insert({
        slug: data.slug,
        title: data.title,
        description: data.description ?? null,
        route_path: data.route_path ?? null,
        status: "draft",
      })
      .select("id").single();
    if (error) throw error;
    return { id: row.id };
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

export const scheduleCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; scheduled_at: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cms_pages")
      .update({ status: "scheduled", scheduled_at: data.scheduled_at })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const archiveCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cms_pages")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const restoreCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cms_pages")
      .update({ status: "draft", archived_at: null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Create a version snapshot of current page meta + blocks. */
export const snapshotCmsPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const [pageRes, blocksRes, verRes] = await Promise.all([
      context.supabase.from("cms_pages").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("cms_blocks").select("kind, position, data").eq("page_id", data.id).order("position"),
      context.supabase.from("cms_page_versions").select("version").eq("page_id", data.id).order("version", { ascending: false }).limit(1),
    ]);
    if (pageRes.error) throw pageRes.error;
    if (blocksRes.error) throw blocksRes.error;
    if (verRes.error) throw verRes.error;
    const nextVersion = (verRes.data?.[0]?.version ?? 0) + 1;
    const snapshot = { page: pageRes.data, blocks: blocksRes.data ?? [] };
    const { error } = await context.supabase.from("cms_page_versions").insert({
      page_id: data.id,
      version: nextVersion,
      note: data.note ?? null,
      snapshot: snapshot as never,
      created_by: context.userId,
    });
    if (error) throw error;
    return { version: nextVersion };
  });

/** Restore blocks + editable meta from a version snapshot. */
export const restoreCmsPageVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) => input)
  .handler(async ({ data, context }) => {
    const v = await context.supabase
      .from("cms_page_versions").select("page_id, snapshot").eq("id", data.versionId).maybeSingle();
    if (v.error) throw v.error;
    if (!v.data) throw new Error("Version not found");
    const pageId = v.data.page_id as string;
    const snap = v.data.snapshot as { page?: Record<string, unknown>; blocks?: Array<{ kind: string; position: number; data: unknown }> };
    if (snap.page) {
      const p = snap.page;
      await context.supabase.from("cms_pages").update({
        title: p.title, slug: p.slug, description: p.description, route_path: p.route_path,
      } as never).eq("id", pageId);
    }
    await context.supabase.from("cms_blocks").delete().eq("page_id", pageId);
    const blocks = snap.blocks ?? [];
    if (blocks.length) {
      const { error } = await context.supabase.from("cms_blocks").insert(
        blocks.map((b, i) => ({ page_id: pageId, kind: b.kind as never, position: i, data: b.data as never })),
      );
      if (error) throw error;
    }
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

export type CmsBlockKind =
  | "hero" | "rich_text" | "image_gallery" | "cta" | "reviews" | "rooms"
  | "experiences" | "faq" | "video" | "statistics" | "contact" | "map";

export interface CmsBlockPatch {
  id?: string;
  page_id: string;
  kind: CmsBlockKind;
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
          kind: b.kind,
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