import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

/** Fetch a published CMS page by slug plus its blocks and SEO override. Returns null on miss or DB unavailable. */
export const getPublicCmsPage = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    try {
      const sb = makeClient();
      const { data: page } = await sb
        .from("cms_pages")
        .select("id, slug, title, description, route_path, published_at, updated_at")
        .eq("slug", data.slug)
        .eq("status", "published")
        .maybeSingle();
      if (!page) return null;
      const [blocksRes, seoRes] = await Promise.all([
        sb.from("cms_blocks").select("id, kind, data, position").eq("page_id", page.id).order("position"),
        page.route_path
          ? sb.from("seo_overrides").select("*").eq("route_path", page.route_path).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { page, blocks: blocksRes.data ?? [], seo: seoRes?.data ?? null };
    } catch {
      return null;
    }
  });

/** All published CMS page slugs — used by sitemap. */
export const listPublishedCmsSlugs = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const sb = makeClient();
      const { data } = await sb
        .from("cms_pages")
        .select("slug, updated_at, route_path")
        .eq("status", "published");
      return data ?? [];
    } catch {
      return [];
    }
  });