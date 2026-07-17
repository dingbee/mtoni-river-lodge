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

export interface PublicSeoOverride {
  title?: string | null;
  description?: string | null;
  canonical_url?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  twitter_card?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  twitter_image?: string | null;
  robots?: string | null;
  index_status?: boolean | null;
  schema_type?: string | null;
}

/**
 * Public (unauthenticated) fetch of a seo_overrides row by route_path.
 * Returns null on miss or if the DB is unavailable — never throws, so
 * SSR prerender and public route loaders stay resilient.
 */
export const getPublicSeoOverride = createServerFn({ method: "GET" })
  .inputValidator((input: { routePath: string }) => input)
  .handler(async ({ data }): Promise<PublicSeoOverride | null> => {
    try {
      const sb = makeClient();
      const { data: row } = await sb
        .from("seo_overrides")
        .select(
          "title, description, canonical_url, og_title, og_description, og_image, twitter_card, twitter_title, twitter_description, twitter_image, robots, index_status, schema_type",
        )
        .eq("route_path", data.routePath)
        .maybeSingle();
      return (row as PublicSeoOverride | null) ?? null;
    } catch {
      return null;
    }
  });