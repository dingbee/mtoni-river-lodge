import type { PublicSeoOverride } from "@/domains/marketing/seo/seo-public.functions";

export interface SeoDefaults {
  title: string;
  description: string;
  canonical: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  robots?: string;
}

export interface ResolvedSeo {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage?: string;
  twitterCard: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  robots: string;
  schemaType?: string | null;
}

/**
 * Merge a CMS seo_overrides row (may be null) with the route's hardcoded defaults.
 * Priority: override → default. `index_status=false` forces robots to noindex.
 */
export function resolveSeo(defaults: SeoDefaults, override: PublicSeoOverride | null | undefined): ResolvedSeo {
  const o = override ?? {};
  const title = (o.title || defaults.title).trim();
  const description = (o.description || defaults.description).trim();
  const canonical = (o.canonical_url || defaults.canonical).trim();
  const ogTitle = (o.og_title || defaults.ogTitle || title).trim();
  const ogDescription = (o.og_description || defaults.ogDescription || description).trim();
  const ogImage = o.og_image || defaults.ogImage || undefined;
  const twitterCard = (o.twitter_card || defaults.twitterCard || "summary_large_image").trim();
  const twitterTitle = o.twitter_title || defaults.twitterTitle || undefined;
  const twitterDescription = o.twitter_description || defaults.twitterDescription || undefined;
  const twitterImage = o.twitter_image || defaults.twitterImage || ogImage;
  let robots = (o.robots || defaults.robots || "index,follow").trim();
  if (o.index_status === false) robots = "noindex,nofollow";
  return {
    title,
    description,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard,
    twitterTitle,
    twitterDescription,
    twitterImage,
    robots,
    schemaType: o.schema_type ?? null,
  };
}

/** Build the meta[] array for a route head() from a resolved SEO record. */
export function seoMeta(seo: ResolvedSeo): Array<Record<string, string>> {
  const meta: Array<Record<string, string>> = [
    { title: seo.title },
    { name: "description", content: seo.description },
    { name: "robots", content: seo.robots },
    { property: "og:title", content: seo.ogTitle },
    { property: "og:description", content: seo.ogDescription },
    { property: "og:url", content: seo.canonical },
    { name: "twitter:card", content: seo.twitterCard },
  ];
  if (seo.ogImage) meta.push({ property: "og:image", content: seo.ogImage });
  if (seo.twitterTitle) meta.push({ name: "twitter:title", content: seo.twitterTitle });
  if (seo.twitterDescription) meta.push({ name: "twitter:description", content: seo.twitterDescription });
  if (seo.twitterImage) meta.push({ name: "twitter:image", content: seo.twitterImage });
  return meta;
}

/** Build an optional JSON-LD script from a schema_type override. */
export function seoSchemaScript(seo: ResolvedSeo, extra?: Record<string, unknown>) {
  if (!seo.schemaType) return null;
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": seo.schemaType,
      name: seo.title,
      description: seo.description,
      url: seo.canonical,
      ...(seo.ogImage ? { image: seo.ogImage } : {}),
      ...(extra ?? {}),
    }),
  };
}