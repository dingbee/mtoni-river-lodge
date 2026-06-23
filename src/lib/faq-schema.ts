export type FAQItem = {
  q: string;
  a: string;
};

/**
 * Build a FAQPage JSON-LD object for a route's `head().scripts` array.
 * Visible FAQ content on the page MUST match the items passed here.
 */
export function buildFAQJsonLd(faqs: ReadonlyArray<FAQItem>) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }),
  };
}