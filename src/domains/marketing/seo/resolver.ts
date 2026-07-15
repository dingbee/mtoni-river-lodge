/**
 * SEO resolver — merges DB override rows over static, hard-coded route
 * metadata. Phase 1 wires the shape only; existing route `head()` blocks are
 * NOT rewritten here, so behaviour is unchanged. Phase 3 opts routes in.
 *
 * This helper is safe to call from server functions or route loaders that
 * are already authenticated / server-side; it does not touch `localStorage`.
 */

export interface ResolvedPageSeo {
  title?: string;
  description?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterCard?: string;
  robots?: string;
  indexStatus?: boolean;
  schemaType?: string;
}

export interface StaticSeoFallback extends ResolvedPageSeo {}

/** Merge a DB override row on top of the compile-time defaults. */
export function mergeSeo(fallback: StaticSeoFallback, override: Partial<ResolvedPageSeo> | null | undefined): ResolvedPageSeo {
  if (!override) return fallback;
  return {
    title: override.title ?? fallback.title,
    description: override.description ?? fallback.description,
    keywords: override.keywords?.length ? override.keywords : fallback.keywords,
    canonicalUrl: override.canonicalUrl ?? fallback.canonicalUrl,
    ogTitle: override.ogTitle ?? fallback.ogTitle,
    ogDescription: override.ogDescription ?? fallback.ogDescription,
    ogImage: override.ogImage ?? fallback.ogImage,
    twitterTitle: override.twitterTitle ?? fallback.twitterTitle,
    twitterDescription: override.twitterDescription ?? fallback.twitterDescription,
    twitterImage: override.twitterImage ?? fallback.twitterImage,
    twitterCard: override.twitterCard ?? fallback.twitterCard,
    robots: override.robots ?? fallback.robots,
    indexStatus: override.indexStatus ?? fallback.indexStatus,
    schemaType: override.schemaType ?? fallback.schemaType,
  };
}