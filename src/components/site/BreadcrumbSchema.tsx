import { useBreadcrumbTrail } from "@/lib/breadcrumbs";

const SITE_ORIGIN = "https://mtoniriverlodge.com";

/**
 * Sitewide BreadcrumbList JSON-LD. Mounted once in the root layout so every
 * route emits a breadcrumb hierarchy for search engines, independent of
 * whether the visual <Breadcrumbs /> nav is rendered on the page.
 *
 * Skips emission on the homepage where a single-item trail adds no value.
 */
export function BreadcrumbSchema() {
  const trail = useBreadcrumbTrail();
  if (trail.length < 2) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.to
        ? `${SITE_ORIGIN}${c.to}`
        : `${SITE_ORIGIN}${typeof window !== "undefined" ? window.location.pathname : ""}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}