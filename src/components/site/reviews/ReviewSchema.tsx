import type { Review, ReviewAggregate } from "@/lib/reviews";

/** Aggregate Rating + Review JSON-LD attached to a LodgingBusiness item. */
export function ReviewSchema({
  reviews,
  aggregates,
}: {
  reviews: Review[];
  aggregates?: ReviewAggregate[];
}) {
  const totalCount = aggregates?.reduce((s, a) => s + a.review_count, 0) ?? reviews.length;
  const totalScore = aggregates?.reduce((s, a) => s + a.average_rating * a.review_count, 0) ?? 0;
  const avg =
    aggregates && totalCount > 0
      ? +(totalScore / totalCount).toFixed(2)
      : reviews.length
        ? +(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2)
        : 0;

  const data = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: "Mtoni River Lodge",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Arusha",
      addressRegion: "Arusha",
      addressCountry: "TZ",
    },
    ...(totalCount > 0 && avg > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avg,
            reviewCount: totalCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    review: reviews.slice(0, 25).map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.guest_name },
      datePublished: r.review_date,
      reviewBody: r.review_text,
      ...(r.title ? { name: r.title } : {}),
      reviewRating: {
        "@type": "Rating",
        ratingValue: r.rating,
        bestRating: 5,
        worstRating: 1,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}