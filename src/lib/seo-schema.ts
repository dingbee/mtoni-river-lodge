const SITE_URL = "https://mtoniriverlodge.com";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Build a BreadcrumbList JSON-LD script entry from a route path. */
export function buildBreadcrumbJsonLd(
  trail: ReadonlyArray<{ name: string; path: string }>,
) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: absoluteUrl(c.path),
      })),
    }),
  };
}

/** Build an Article (BlogPosting) JSON-LD script entry. */
export function buildArticleJsonLd(opts: {
  title: string;
  description: string;
  image: string;
  routePath: string;
  datePublished: string;
  dateModified?: string;
}) {
  const url = absoluteUrl(opts.routePath);
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: opts.title,
      description: opts.description,
      image: absoluteUrl(opts.image),
      datePublished: opts.datePublished,
      dateModified: opts.dateModified ?? opts.datePublished,
      author: { "@type": "Organization", name: "Mtoni River Lodge" },
      publisher: {
        "@type": "Organization",
        name: "Mtoni River Lodge",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/favicon.ico`,
        },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
    }),
  };
}