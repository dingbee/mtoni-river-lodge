import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { defineAiInterface, aiPlaceholder } from "@/domains/_platform/ai/interface";

export type JournalStatus = "draft" | "scheduled" | "published" | "archived";

export interface JournalArticleInput {
  id?: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  content_html?: string | null;
  content_json?: unknown;
  cover_image_url?: string | null;
  read_minutes?: number | null;
  status?: JournalStatus;
  author_id?: string | null;
  category_id?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_og_image?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
}

/** List journal articles (staff view — all statuses). */
export const listJournalArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("journal_articles")
      .select("id, slug, title, excerpt, status, cover_image_url, read_minutes, published_at, scheduled_at, updated_at, author_id, category_id")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("journal_articles")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    return row;
  });

export const createJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { slug: string; title: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("journal_articles")
      .insert({ slug: data.slug, title: data.title, status: "draft", created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

export const upsertJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: JournalArticleInput) => input)
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required for upsert");
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("journal_articles")
      .update(patch as never)
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("journal_articles").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const publishJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; publishedAt?: string }) => input)
  .handler(async ({ data, context }) => {
    const publishedAt = data.publishedAt ?? new Date().toISOString();
    const { error } = await context.supabase
      .from("journal_articles")
      .update({ status: "published", published_at: publishedAt, scheduled_at: null })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const scheduleJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; scheduledAt: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("journal_articles")
      .update({ status: "scheduled", scheduled_at: data.scheduledAt })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const archiveJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("journal_articles")
      .update({ status: "archived" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listJournalTaxonomies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [authors, categories, tags] = await Promise.all([
      context.supabase.from("journal_authors").select("id, name, slug").order("name"),
      context.supabase.from("journal_categories").select("id, name, slug").order("name"),
      context.supabase.from("journal_tags").select("id, name, slug").order("name"),
    ]);
    return {
      authors: authors.data ?? [],
      categories: categories.data ?? [],
      tags: tags.data ?? [],
    };
  });

/** Return current tag ids assigned to an article. */
export const listArticleTagIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { articleId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("journal_article_tags").select("tag_id").eq("article_id", data.articleId);
    if (error) throw error;
    return (rows ?? []).map((r) => r.tag_id as string);
  });

/** Replace the article's tag set with the given list of tag ids. */
export const setArticleTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { articleId: string; tagIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase.from("journal_article_tags").delete().eq("article_id", data.articleId);
    if (data.tagIds.length) {
      const rows = data.tagIds.map((tag_id) => ({ article_id: data.articleId, tag_id }));
      const { error } = await context.supabase.from("journal_article_tags").insert(rows);
      if (error) throw error;
    }
    return { ok: true };
  });

/** Toggle the featured flag on an article. */
export const setArticleFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; featured: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("journal_articles").update({ featured: data.featured } as never).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** List article version snapshots (staff only). */
export const listArticleVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { articleId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("journal_article_versions")
      .select("id, version, note, created_at")
      .eq("article_id", data.articleId)
      .order("version", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

/** Snapshot the current state of an article. */
export const snapshotJournalArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const [article, tags, latest] = await Promise.all([
      context.supabase.from("journal_articles").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("journal_article_tags").select("tag_id").eq("article_id", data.id),
      context.supabase.from("journal_article_versions").select("version").eq("article_id", data.id).order("version", { ascending: false }).limit(1),
    ]);
    if (article.error) throw article.error;
    if (tags.error) throw tags.error;
    if (latest.error) throw latest.error;
    const nextVersion = (latest.data?.[0]?.version ?? 0) + 1;
    const snapshot = {
      article: article.data,
      tag_ids: (tags.data ?? []).map((r) => r.tag_id),
    };
    const { error } = await context.supabase.from("journal_article_versions").insert({
      article_id: data.id,
      version: nextVersion,
      note: data.note ?? null,
      snapshot: snapshot as never,
      created_by: context.userId,
    });
    if (error) throw error;
    return { version: nextVersion };
  });

/** Restore a prior article snapshot (content + tags). */
export const restoreJournalArticleVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) => input)
  .handler(async ({ data, context }) => {
    const v = await context.supabase
      .from("journal_article_versions").select("article_id, snapshot").eq("id", data.versionId).maybeSingle();
    if (v.error) throw v.error;
    if (!v.data) throw new Error("Version not found");
    const articleId = v.data.article_id as string;
    const snap = v.data.snapshot as { article?: Record<string, unknown>; tag_ids?: string[] };
    if (snap.article) {
      const a = snap.article;
      await context.supabase.from("journal_articles").update({
        title: a.title, slug: a.slug, excerpt: a.excerpt,
        content_html: a.content_html, content_json: a.content_json,
        cover_image_url: a.cover_image_url, read_minutes: a.read_minutes,
        seo_title: a.seo_title, seo_description: a.seo_description, seo_og_image: a.seo_og_image,
        author_id: a.author_id, category_id: a.category_id, featured: a.featured,
      } as never).eq("id", articleId);
    }
    await context.supabase.from("journal_article_tags").delete().eq("article_id", articleId);
    const tagIds = snap.tag_ids ?? [];
    if (tagIds.length) {
      await context.supabase.from("journal_article_tags").insert(
        tagIds.map((tag_id) => ({ article_id: articleId, tag_id })),
      );
    }
    return { ok: true };
  });

/** Related articles — same category or shared tags, published only, capped at N. */
export const getRelatedArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { articleId: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 4;
    const self = await context.supabase
      .from("journal_articles").select("category_id").eq("id", data.articleId).maybeSingle();
    if (self.error) throw self.error;
    const tagRows = await context.supabase
      .from("journal_article_tags").select("tag_id").eq("article_id", data.articleId);
    const tagIds = (tagRows.data ?? []).map((r) => r.tag_id as string);

    // Candidates by shared tag
    let ids: string[] = [];
    if (tagIds.length) {
      const t = await context.supabase
        .from("journal_article_tags").select("article_id").in("tag_id", tagIds);
      ids = Array.from(new Set(((t.data ?? []).map((r) => r.article_id as string))))
        .filter((id) => id !== data.articleId);
    }
    const orClauses = [
      self.data?.category_id ? `category_id.eq.${self.data.category_id}` : null,
      ids.length ? `id.in.(${ids.join(",")})` : null,
    ].filter(Boolean).join(",");

    let q = context.supabase.from("journal_articles")
      .select("id, slug, title, excerpt, cover_image_url, published_at, read_minutes")
      .eq("status", "published").neq("id", data.articleId)
      .order("published_at", { ascending: false }).limit(limit);
    if (orClauses) q = q.or(orClauses);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** Naive internal-link suggestions — matches significant words from other published titles. */
export const getInternalLinkSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { articleId: string; text: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("journal_articles")
      .select("id, slug, title")
      .eq("status", "published").neq("id", data.articleId);
    if (error) throw error;
    const haystack = (data.text ?? "").toLowerCase();
    const suggestions = (rows ?? [])
      .map((r) => {
        const words = String(r.title).toLowerCase().split(/\W+/).filter((w) => w.length > 4);
        const hits = words.filter((w) => haystack.includes(w));
        return { ...r, score: hits.length, matched: Array.from(new Set(hits)) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return suggestions;
  });

/** AI-ready placeholders for the Journal domain. */
export const journalAi = defineAiInterface({
  summarize: async (input: unknown) => aiPlaceholder("journal.summarize", input),
  suggest: async (input: unknown) => aiPlaceholder("journal.suggest_title", input),
  analyze: async (input: unknown) => aiPlaceholder("journal.analyze_seo", input),
  recommend: async (input: unknown) => aiPlaceholder("journal.recommend_tags", input),
});