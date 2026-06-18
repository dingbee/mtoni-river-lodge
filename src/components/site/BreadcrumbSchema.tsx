import { useRouterState } from "@tanstack/react-router";
import { buildTrail } from "@/lib/breadcrumbs";

const SITE_ORIGIN = "https://mtoniriverlodge.com";

/**
 * Sitewide BreadcrumbList JSON-LD. Mounted once in the root layout so every
 * route emits a breadcrumb hierarchy for search engines, independent of
 * whether the visual <Breadcrumbs /> nav is rendered on the page.
 *
 * Skips emission on the homepage where a single-item trail adds no value.
 */
export function BreadcrumbSchema() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const trail = buildTrail(pathname);
  if (trail.length < 2) return null;
  const currentPath = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE_ORIGIN}${c.to ?? currentPath}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}