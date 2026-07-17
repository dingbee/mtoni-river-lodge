import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Server-side, publishable-key client. Reads only rows that anon RLS allows. */
function makeClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Public fetch by slug — returns null if not found OR database unreachable (static fallback). */
export const getPublicJournalArticle = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    try {
      const sb = makeClient();
      const { data: article, error } = await sb
        .from("journal_articles")
        .select("id, slug, title, excerpt, content_html, cover_image_url, read_minutes, published_at, featured, seo_title, seo_description, seo_og_image, author_id, category_id")
        .eq("slug", data.slug).eq("status", "published").maybeSingle();
      if (error || !article) return null;
      const [author, category, tagRows] = await Promise.all([
        article.author_id
          ? sb.from("journal_authors").select("id, name, slug, avatar_url, bio").eq("id", article.author_id).maybeSingle()
          : Promise.resolve({ data: null }),
        article.category_id
          ? sb.from("journal_categories").select("id, name, slug").eq("id", article.category_id).maybeSingle()
          : Promise.resolve({ data: null }),
        sb.from("journal_article_tags").select("tag_id, journal_tags(name, slug)").eq("article_id", article.id),
      ]);
      return {
        article,
        author: author?.data ?? null,
        category: category?.data ?? null,
        tags: (tagRows.data ?? []).map((r) => r.journal_tags).filter(Boolean),
      };
    } catch {
      return null;
    }
  });

/** Public related list — category match or shared tags, published only. */
export const getPublicRelatedArticles = createServerFn({ method: "GET" })
  .inputValidator((input: { articleId: string; limit?: number }) => input)
  .handler(async ({ data }) => {
    try {
      const sb = makeClient();
      const limit = data.limit ?? 3;
      const self = await sb.from("journal_articles").select("category_id").eq("id", data.articleId).maybeSingle();
      const tagRows = await sb.from("journal_article_tags").select("tag_id").eq("article_id", data.articleId);
      const tagIds = (tagRows.data ?? []).map((r) => r.tag_id as string);
      let peerIds: string[] = [];
      if (tagIds.length) {
        const t = await sb.from("journal_article_tags").select("article_id").in("tag_id", tagIds);
        peerIds = Array.from(new Set((t.data ?? []).map((r) => r.article_id as string))).filter((id) => id !== data.articleId);
      }
      const orParts = [
        self.data?.category_id ? `category_id.eq.${self.data.category_id}` : null,
        peerIds.length ? `id.in.(${peerIds.join(",")})` : null,
      ].filter(Boolean);
      let q = sb.from("journal_articles")
        .select("id, slug, title, excerpt, cover_image_url, published_at, read_minutes")
        .eq("status", "published").neq("id", data.articleId)
        .order("published_at", { ascending: false }).limit(limit);
      if (orParts.length) q = q.or(orParts.join(","));
      const { data: rows } = await q;
      return rows ?? [];
    } catch {
      return [];
    }
  });

/** All published journal articles for listing / homepage / sitemap. */
export const listPublishedJournalArticles = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const sb = makeClient();
      const { data } = await sb
        .from("journal_articles")
        .select("id, slug, title, excerpt, cover_image_url, published_at, read_minutes, featured")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      return data ?? [];
    } catch {
      return [];
    }
  });