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

/** AI-ready placeholders for the Journal domain. */
export const journalAi = defineAiInterface({
  summarize: async (input: unknown) => aiPlaceholder("journal.summarize", input),
  suggest: async (input: unknown) => aiPlaceholder("journal.suggest_title", input),
  analyze: async (input: unknown) => aiPlaceholder("journal.analyze_seo", input),
  recommend: async (input: unknown) => aiPlaceholder("journal.recommend_tags", input),
});